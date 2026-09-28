import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  ping: vi.fn(),
  issues: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
  identityDb: { transaction: mocks.transaction },
}));
vi.mock("@/lib/redis", () => ({ redis: { ping: mocks.ping } }));
vi.mock("@/lib/env", () => ({ productionConfigurationIssues: mocks.issues }));

import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";
import { boundedProbe } from "@/lib/health";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.issues.mockReturnValue([]);
  mocks.ping.mockResolvedValue("PONG");
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ execute: vi.fn().mockResolvedValue([]) }),
  );
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_RUNTIME_URL", "postgresql://runtime@db.example.com/db");
  vi.stubEnv(
    "DATABASE_IDENTITY_URL",
    "postgresql://identity@db.example.com/db",
  );
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe("liveness and readiness", () => {
  it("liveness reports release without probing or exposing credentials", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      release: "a".repeat(40),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("requires successful runtime, identity and Redis checks", async () => {
    const response = await ready();
    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.ping).toHaveBeenCalledTimes(1);
    expect((await response.json()).checks).toEqual({
      configuration: "ok",
      database: "ok",
      identity: "ok",
      redis: "ok",
    });
  });
  it("returns 503 with masked checks when a dependency fails", async () => {
    mocks.ping.mockRejectedValue(new Error("redis-secret-url-token"));
    const response = await ready();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "redis-secret-url-token",
    );
  });
  it("bounds a stalled dependency probe", async () => {
    expect(await boundedProbe(() => new Promise(() => {}), 5)).toBe(
      "unavailable",
    );
  });
});
