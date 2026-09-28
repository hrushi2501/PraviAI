import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bucket: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn(),
  attach: vi.fn(),
  access: vi.fn(),
  set: vi.fn(),
  rows: [] as unknown[][],
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    storage: {
      getBucket: mocks.bucket,
      from: () => ({
        upload: mocks.upload,
        download: mocks.download,
        remove: mocks.remove,
        createSignedUrl: mocks.sign,
      }),
    },
  }),
}));
vi.mock("@/lib/redis", () => ({ redis: { set: mocks.set } }));
vi.mock("@/lib/logger", () => ({ reportError: vi.fn() }));
vi.mock("@/server/db/stored-procedures", () => ({
  StoredProcedureGateway: class {
    attachEvidence = mocks.attach;
    requestEvidenceAccess = mocks.access;
  },
}));

import { inspectEvidenceFile } from "@/lib/evidence-file";
import type { DatabaseSession } from "@/server/db/session";
import type { EvidenceRepository } from "@/server/repositories/evidence.repository";
import { EvidenceService } from "@/server/services/evidence.service";

const assetId = "00000000-0000-4000-8000-000000000001";
const departmentId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const actorId = "user_actual";
const input = {
  assetId,
  requestId,
  classification: "internal" as const,
  name: "survey.pdf",
  mime: "application/pdf",
  bytes: new TextEncoder().encode("%PDF-1.7\nsurvey"),
};
function service() {
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    select: () => ({
      from: () => ({ where: async () => mocks.rows.shift() ?? [] }),
    }),
    transaction: async (callback: (tx: unknown) => unknown) => callback({}),
  };
  const session = {
    actorId,
    withTransaction: async (
      callback: (tx: unknown, procs: unknown) => unknown,
    ) => callback(tx, { requestEvidenceAccess: mocks.access }),
  } as unknown as DatabaseSession;
  return new EvidenceService(session, {} as EvidenceRepository);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  mocks.rows = [
    [
      {
        departmentId,
        allowed: true,
        archivedAt: null,
        retiredAt: null,
        registrationStatus: "draft",
        workApprover: false,
      },
    ],
  ];
  mocks.bucket.mockResolvedValue({ data: { public: false }, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({
    error: null,
    data: new Blob([input.bytes]),
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.attach.mockResolvedValue({
    id: "evidence_actual",
    originalName: "survey.pdf",
    classification: "internal",
    objectKey: "secret-path",
  });
  mocks.sign.mockResolvedValue({
    data: {
      signedUrl:
        "https://storage.example.com/storage/v1/object/sign/private/secret-path?token=secret",
    },
    error: null,
  });
  mocks.set.mockResolvedValue("OK");
});
afterEach(() => vi.unstubAllEnvs());

describe("verified private evidence upload", () => {
  it("authorizes the parent before any storage call", async () => {
    mocks.rows = [[{ departmentId, allowed: false }]];
    await expect(service().uploadEvidence(input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects wrong/frozen inspection parents before storage", async () => {
    mocks.rows.push([{ createdBy: "different_assessor", status: "draft" }]);
    await expect(
      service().uploadEvidence({
        ...input,
        inspectionId: "00000000-0000-4000-8000-000000000004",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("refuses a public bucket", async () => {
    mocks.bucket.mockResolvedValue({ data: { public: true }, error: null });
    await expect(service().uploadEvidence(input)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("calculates metadata and immutable keys server-side without exposing them", async () => {
    const result = await service().uploadEvidence(input);
    const metadata = inspectEvidenceFile(input.name, input.mime, input.bytes);
    const command = mocks.attach.mock.calls[0][0];
    expect(command.data.provider).toBe("supabase_private");
    expect(command.data.sha256).toBe(metadata.sha256);
    expect(command.data.size_bytes).toBe(input.bytes.length);
    expect(command.data.object_key).toMatch(
      new RegExp(
        `^${departmentId}/[a-f0-9]{24}/${assetId}/${assetId}/${requestId}/[a-f0-9]{64}\\.pdf$`,
      ),
    );
    expect(result).toEqual({
      id: "evidence_actual",
      originalName: "survey.pdf",
      classification: "internal",
    });
    expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
  });
  it("cleans only newly uploaded objects if attachment fails", async () => {
    mocks.attach.mockRejectedValue(new Error("Parent became frozen"));
    await expect(service().uploadEvidence(input)).rejects.toThrow();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove.mock.calls[0][0]).toEqual([
      mocks.upload.mock.calls[0][0],
    ]);
  });
  it("verifies existing retry bytes rather than trusting a storage path", async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: "409" } });
    mocks.download.mockResolvedValue({
      error: null,
      data: new Blob(["attacker-content"]),
    });
    await expect(service().uploadEvidence(input)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("never deletes a pre-existing object on a failed retry", async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: "409" } });
    mocks.attach.mockRejectedValue(new Error("Already linked or changed"));
    await expect(service().uploadEvidence(input)).rejects.toThrow();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("audited private evidence delivery", () => {
  it("returns an actor-bound opaque download ticket instead of provider paths", async () => {
    mocks.access.mockResolvedValue({
      id: "evidence_actual",
      provider: "supabase_private",
      object_key: `${departmentId}/private.pdf`,
    });
    const result = await service().requestAuditedUrl({
      evidenceId: assetId,
      purpose: "Inspection review",
    });
    expect(mocks.access).toHaveBeenCalledWith({
      evidenceId: assetId,
      purpose: "Inspection review",
    });
    expect(result.url).toMatch(
      new RegExp(`^/api/evidence/${assetId}/download\\?ticket=`),
    );
    expect(result.expiresIn).toBe(60);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(mocks.set.mock.calls[0][1].actorId).toBe(actorId);
    expect(mocks.set.mock.calls[0][2]).toEqual({ ex: 60 });
  });
  it("does not sign unimplemented providers", async () => {
    mocks.access.mockResolvedValue({
      provider: "cloudinary",
      object_key: "unverified-public-reference",
    });
    await expect(
      service().requestAuditedUrl({ evidenceId: assetId, purpose: "Review" }),
    ).rejects.toMatchObject({ statusCode: 501 });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});

describe("evidence file verification", () => {
  it("rejects spoofed MIME, extension and header combinations", () => {
    expect(() =>
      inspectEvidenceFile(
        "fake.png",
        "image/png",
        new TextEncoder().encode("<script>alert(1)</script>"),
      ),
    ).toThrow();
    expect(() =>
      inspectEvidenceFile("fake.jpg", "application/pdf", input.bytes),
    ).toThrow();
    expect(() =>
      inspectEvidenceFile("../../survey.pdf", "application/pdf", input.bytes),
    ).toThrow();
  });
});
