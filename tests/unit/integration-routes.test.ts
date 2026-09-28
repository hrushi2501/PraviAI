import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, verifySignature } = vi.hoisted(() => ({
  auth: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/qstash", () => ({ verifyQStashSignature: verifySignature }));

import { POST as dispatchOutbox } from "@/app/api/crons/outbox/route";
import { POST as signEvidence } from "@/app/api/evidence/sign/route";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("evidence upload safety", () => {
  it("rejects unauthenticated callers", async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await signEvidence()).status).toBe(401);
  });

  it("does not issue upload credentials without parent authorization", async () => {
    auth.mockResolvedValue({ userId: "user_123" });
    const response = await signEvidence();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty("signature");
    expect(body).not.toHaveProperty("apiKey");
  });
});

describe("outbox delivery safety", () => {
  it("rejects invalid or unconfigured signature verification", async () => {
    verifySignature.mockResolvedValue(false);
    const request = new Request("https://example.com/api/crons/outbox", {
      method: "POST",
      body: "{}",
    });
    const response = await dispatchOutbox(request);
    expect(response.status).toBe(401);
    expect(verifySignature).toHaveBeenCalledWith(request, "{}");
  });

  it("reports delivery unavailable without claiming jobs were processed", async () => {
    verifySignature.mockResolvedValue(true);
    const response = await dispatchOutbox(
      new Request("https://example.com/api/crons/outbox", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty("processed");
  });
});
