import { describe, expect, it } from "vitest";
import { resolveDatabaseConnection } from "@/db/connection-config";

describe("Isolated database credential policy", () => {
  it("fails closed in production instead of falling back to an owner URL", () => {
    expect(() =>
      resolveDatabaseConnection("runtime", {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://postgres:secret@localhost/db",
        ALLOW_LEGACY_DATABASE_URL: "true",
      }),
    ).toThrow("dedicated");
    expect(() =>
      resolveDatabaseConnection("identity", {
        NODE_ENV: "production",
        DATABASE_RUNTIME_URL: "postgres://runtime:secret@localhost/db",
        DATABASE_IDENTITY_URL: "postgres://postgres:secret@localhost/db",
      }),
    ).toThrow("least-privilege");
  });
  it("requires distinct runtime and identity login credentials", () => {
    expect(() =>
      resolveDatabaseConnection("runtime", {
        NODE_ENV: "production",
        DATABASE_RUNTIME_URL: "postgres://runtime:secret@localhost/db",
        DATABASE_IDENTITY_URL: "postgres://runtime:secret@localhost/db",
      }),
    ).toThrow("separate");
    const environment = {
      NODE_ENV: "production",
      DATABASE_RUNTIME_URL: "postgres://runtime:secret@localhost/db",
      DATABASE_IDENTITY_URL: "postgres://identity:secret@localhost/db",
    };
    expect(resolveDatabaseConnection("identity", environment)).toEqual({
      connectionString: environment.DATABASE_IDENTITY_URL,
      legacyDevelopment: false,
    });
  });
  it("uses legacy owner-compatible connections only after an explicit development opt-in", () => {
    const environment = {
      NODE_ENV: "development",
      DATABASE_URL: "postgres://owner:secret@localhost/db",
    };
    expect(() => resolveDatabaseConnection("runtime", environment)).toThrow(
      "explicit opt-in",
    );
    expect(
      resolveDatabaseConnection("identity", {
        ...environment,
        ALLOW_LEGACY_DATABASE_URL: "true",
      }).legacyDevelopment,
    ).toBe(true);
  });
});
