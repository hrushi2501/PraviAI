import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as { eval: ReturnType<typeof vi.fn> } | null,
  log: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
  get redis() {
    return state.client;
  },
}));
vi.mock("@/lib/logger", () => ({ logEvent: state.log }));

import { enforceActorRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.resetAllMocks();
  state.client = { eval: vi.fn().mockResolvedValue([1, 60000]) };
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("distributed action rate limiting", () => {
  it("allows within the shared limit and hashes actor identifiers", async () => {
    await enforceActorRateLimit("user_private");
    expect(state.client?.eval).toHaveBeenCalledTimes(1);
    const [, keys] = state.client?.eval.mock.calls[0] ?? [];
    expect(keys[0]).toMatch(/^pravi:limit:actions:[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain("user_private");
  });
  it("rejects the next request with the shared TTL retry delay", async () => {
    state.client?.eval.mockResolvedValue([121, 1250]);
    await expect(enforceActorRateLimit("user_private")).rejects.toMatchObject({
      statusCode: 429,
      retryAfter: 2,
    });
  });
  it("fails closed in production when Redis is missing or fails", async () => {
    state.client?.eval.mockRejectedValue(new Error("secret connection detail"));
    await expect(enforceActorRateLimit("user_private")).rejects.toMatchObject({
      statusCode: 503,
    });
    state.client = null;
    await expect(enforceActorRateLimit("user_private")).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it("explicitly reports the development-only bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    state.client = null;
    await enforceActorRateLimit("user_private");
    expect(state.log).toHaveBeenCalledWith(
      "warn",
      "rate_limit_development_bypass",
      { configured: false },
    );
  });
});
