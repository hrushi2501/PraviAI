import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logEvent,
  redactLogFields,
  reportError,
  validRequestId,
} from "@/lib/logger";

afterEach(() => vi.restoreAllMocks());
describe("Server diagnostic privacy", () => {
  it("redacts nested credentials and sensitive narrative/identity data", () => {
    expect(
      redactLogFields({
        email: "official@example.com",
        nested: {
          token: "private",
          authorization: "Bearer test",
          message: "postgres://owner:private@db.invalid/private",
        },
        narrative: "private complaint",
        objectKey: "private/object",
      }),
    ).toEqual({
      email: "[REDACTED]",
      nested: {
        token: "[REDACTED]",
        authorization: "[REDACTED]",
        message: "postgres://[REDACTED]@db.invalid/private",
      },
      narrative: "[REDACTED]",
      objectKey: "[REDACTED]",
    });
  });
  it("does not log exception messages containing raw SQL or user input", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("SQL private complainant and password");
    reportError(error, "request_failed", { requestId: crypto.randomUUID() });
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.fields.errorType).toBe("Error");
    expect(JSON.stringify(entry)).not.toContain("SQL private");
    expect(entry.fields.frames.length).toBeGreaterThan(0);
  });
  it("outputs parseable structured events with stable correlation fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const id = crypto.randomUUID();
    logEvent("info", "request_completed", { requestId: id, durationMs: 17 });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({
      level: "info",
      event: "request_completed",
      fields: { requestId: id, durationMs: 17 },
    });
    expect(validRequestId(id)).toBe(id);
    expect(validRequestId("malicious\nentry")).toMatch(/^[a-f\d-]{36}$/);
  });
});
