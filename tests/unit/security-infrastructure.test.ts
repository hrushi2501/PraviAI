import { describe, expect, it } from "vitest";
import { productionConfigurationIssues, validateEnvironment } from "@/lib/env";
import { RequestBodyError, readRequestBody } from "@/lib/request-body";
import { securityHeaders } from "@/lib/security-headers";

const core = {
  NODE_ENV: "production",
  DATABASE_RUNTIME_URL: "postgresql://runtime@db.example.com/db",
  DATABASE_IDENTITY_URL: "postgresql://identity@db.example.com/db",
  CLERK_SECRET_KEY: "configured",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "configured",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "configured",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
};
describe("deployment configuration", () => {
  it("requires separate production pools and Redis without requiring optional AI", () => {
    expect(productionConfigurationIssues(core)).toEqual([]);
    expect(
      productionConfigurationIssues({
        ...core,
        DATABASE_IDENTITY_URL: core.DATABASE_RUNTIME_URL,
      }),
    ).toContain("DATABASE_POOLS_MUST_BE_SEPARATE");
    expect(
      productionConfigurationIssues({ ...core, UPSTASH_REDIS_REST_TOKEN: "" }),
    ).toContain("UPSTASH_REDIS_REST_TOKEN");
  });
  it("reports invalid setting names without exposing values", () => {
    expect(() => validateEnvironment({ LOG_LEVEL: "private-value" })).toThrow(
      "LOG_LEVEL",
    );
    expect(() =>
      validateEnvironment({ LOG_LEVEL: "private-value" }),
    ).not.toThrow("private-value");
  });
  it("rejects insecure production origins and partially configured telemetry", () => {
    expect(
      productionConfigurationIssues({
        ...core,
        NEXT_PUBLIC_APP_URL: "http://app.example.com",
        ERROR_REPORTING_URL: "https://errors.example.com",
      }),
    ).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL",
        "ERROR_REPORTING_CONFIGURATION",
      ]),
    );
  });
});

describe("security response policy", () => {
  it("allows actual Clerk, map tiles and hydration while rejecting object embedding", () => {
    const key = `pk_live_${Buffer.from("clerk.example.com$").toString("base64")}`;
    const headers = securityHeaders(true, key);
    const csp =
      headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("https://clerk.example.com");
    expect(csp).toContain("https://tile.openstreetmap.org");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headers).toContainEqual({
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    });
  });
  it("does not force HTTPS or HSTS on local development", () => {
    expect(
      securityHeaders(false).find((h) => h.key === "Content-Security-Policy")
        ?.value,
    ).toContain("'unsafe-eval'");
    expect(
      securityHeaders(false).some((h) => h.key === "Strict-Transport-Security"),
    ).toBe(false);
  });
});

describe("bounded webhook bodies", () => {
  it("counts UTF-8 bytes even when Content-Length is absent", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "ééé",
    });
    await expect(readRequestBody(request, 5)).rejects.toMatchObject({
      statusCode: 413,
    });
  });
  it("preserves signed request text exactly", async () => {
    const body = '{ "message": "नमस्ते" }\n';
    expect(
      await readRequestBody(
        new Request("https://example.com", { method: "POST", body }),
      ),
    ).toBe(body);
  });
  it("rejects invalid encodings and oversized declared lengths", async () => {
    await expect(
      readRequestBody(
        new Request("https://example.com", {
          method: "POST",
          body: new Uint8Array([255]),
        }),
      ),
    ).rejects.toBeInstanceOf(RequestBodyError);
    await expect(
      readRequestBody(
        new Request("https://example.com", {
          method: "POST",
          body: "{}",
          headers: { "content-length": "100000" },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});
