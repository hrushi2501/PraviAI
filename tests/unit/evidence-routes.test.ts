import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  upload: vi.fn(),
  audit: vi.fn(),
  ticket: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/env", () => ({ productionConfigurationIssues: () => [] }));
vi.mock("@/lib/error-reporting", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  validRequestId: () => "00000000-0000-4000-8000-000000000003",
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceActorRateLimit: mocks.rate,
  RateLimitError: class extends Error {},
}));
vi.mock("@/lib/redis", () => ({ redis: { get: mocks.ticket } }));
vi.mock("@/server/services/service-factory", () => ({
  createDomainContainer: () => ({
    services: {
      evidence: {
        uploadEvidence: mocks.upload,
        requestAuditedAccess: mocks.audit,
      },
    },
  }),
}));

import { GET as download } from "@/app/api/evidence/[id]/download/route";
import { POST as upload } from "@/app/api/evidence/upload/route";
import { DomainError } from "@/server/db/error-mapper";

const id = "00000000-0000-4000-8000-000000000001";
const ticket = "00000000-0000-4000-8000-000000000002";
function multipart(extraKey?: string) {
  const data = new FormData();
  data.set(
    "file",
    new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    "survey.pdf",
  );
  data.set("assetId", id);
  data.set("requestId", ticket);
  if (extraKey) data.set(extraKey, "caller-forged");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.com");
  mocks.auth.mockResolvedValue({ userId: "user_verified" });
  mocks.upload.mockResolvedValue({
    id: "evidence_actual",
    originalName: "survey.pdf",
  });
  mocks.audit.mockResolvedValue({});
  mocks.ticket.mockResolvedValue({
    actorId: "user_verified",
    evidenceId: id,
    signedUrl:
      "https://storage.example.com/storage/v1/object/sign/private/hidden-key?token=secret",
  });
  mocks.fetch.mockResolvedValue(
    new Response("%PDF-1.7 verified", {
      headers: { "content-type": "application/pdf" },
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("upload request authorization", () => {
  it("rejects missing and foreign origins before parent/storage work", async () => {
    for (const origin of [
      undefined,
      "https://attacker.example.com",
      "bad origin",
    ]) {
      const response = await upload(
        new Request("https://app.example.com/api/evidence/upload", {
          method: "POST",
          body: multipart(),
          headers: origin ? { origin } : {},
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied storage metadata", async () => {
    const response = await upload(
      new Request("https://app.example.com/api/evidence/upload", {
        method: "POST",
        body: multipart("objectKey"),
        headers: { origin: "https://app.example.com" },
      }),
    );
    expect(response.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("passes file bytes through the authorized service and returns minimal metadata", async () => {
    const response = await upload(
      new Request("https://app.example.com/api/evidence/upload", {
        method: "POST",
        body: multipart(),
        headers: { origin: "https://app.example.com" },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.rate).toHaveBeenCalledWith(
      "user_verified",
      "evidence-uploads",
      10,
      60000,
    );
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({
      assetId: id,
      requestId: ticket,
      name: "survey.pdf",
      mime: "application/pdf",
    });
    expect(JSON.stringify(await response.json())).not.toContain("objectKey");
  });
});

describe("opaque evidence downloads", () => {
  it("rejects another actor's ticket without fetching evidence", async () => {
    mocks.ticket.mockResolvedValue({
      actorId: "other_user",
      evidenceId: id,
      signedUrl: "hidden",
    });
    const response = await download(
      new Request(
        `https://app.example.com/api/evidence/${id}/download?ticket=${ticket}`,
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rechecks revoked permissions even before ticket expiry", async () => {
    mocks.audit.mockRejectedValue(
      new DomainError("Access revoked", "FORBIDDEN", 403),
    );
    const response = await download(
      new Request(
        `https://app.example.com/api/evidence/${id}/download?ticket=${ticket}`,
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("refuses a ticket pointing outside the configured storage origin", async () => {
    mocks.ticket.mockResolvedValue({
      actorId: "user_verified",
      evidenceId: id,
      signedUrl: "https://attacker.example.com/storage/v1/object/sign/file",
    });
    const response = await download(
      new Request(
        `https://app.example.com/api/evidence/${id}/download?ticket=${ticket}`,
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("streams protected bytes without redirecting to an object key or storage URL", async () => {
    const response = await download(
      new Request(
        `https://app.example.com/api/evidence/${id}/download?ticket=${ticket}`,
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.7 verified");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
