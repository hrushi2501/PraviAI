import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
  factory: vi.fn(),
  log: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-pravi-request-id": "00000000-0000-4000-8000-000000000001",
    }),
}));
vi.mock("@/lib/env", () => ({ productionConfigurationIssues: () => [] }));
vi.mock("@/lib/logger", () => ({
  logEvent: mocks.log,
  validRequestId: (value: string) => value,
}));
vi.mock("@/lib/error-reporting", () => ({ captureError: mocks.capture }));
vi.mock("@/lib/rate-limit", () => ({
  enforceActorRateLimit: mocks.limit,
  RateLimitError: class extends Error {},
}));
vi.mock("@/server/services/service-factory", () => ({
  ServiceFactory: { forUser: mocks.factory },
}));

import { withAuthenticatedAction } from "@/server/actions/action-client";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_verified" });
  mocks.factory.mockReturnValue({});
});
describe("authenticated action response safety", () => {
  it("preserves Next routing signals instead of converting them into server failures", async () => {
    const signal = Object.assign(new Error("route redirect"), {
      digest: "NEXT_REDIRECT;replace;/sign-in;307;",
    });
    await expect(
      withAuthenticatedAction(async () => {
        throw signal;
      }),
    ).rejects.toBe(signal);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not invoke rate or database work for unauthenticated requests", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const result = await withAuthenticatedAction(async () => "never");
    expect(result).toMatchObject({ success: false, statusCode: 403 });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it("returns validation failures as 422", async () => {
    const result = await withAuthenticatedAction(async () =>
      z.uuid().parse("bad-id"),
    );
    expect(result).toMatchObject({
      success: false,
      statusCode: 422,
      code: "VALIDATION_ERROR",
    });
  });
  it("hides raw internal error messages but retains correlation", async () => {
    const result = await withAuthenticatedAction(async () => {
      throw new Error("postgres://owner:secret@privatehost/customer_data");
    });
    expect(result).toMatchObject({
      success: false,
      statusCode: 500,
      requestId: "00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });
});
