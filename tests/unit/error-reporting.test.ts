import { afterEach, expect, it, vi } from "vitest";
import { captureError } from "@/lib/error-reporting";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("does not send externally until a collector is configured", async () => {
  vi.stubEnv("ERROR_REPORTING_URL", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await captureError(new Error("private message"), "failed");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("redacts identities and secrets in bounded authenticated collector events", async () => {
  vi.stubEnv("ERROR_REPORTING_URL", "https://collector.example.test/events");
  vi.stubEnv("ERROR_REPORTING_TOKEN", "collector-private-key");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await captureError(new Error("private request body"), "failed", {
    email: "official@example.com",
    token: "secret",
    requestId: crypto.randomUUID(),
  });
  const init = fetchMock.mock.calls[0][1];
  expect(init.headers.Authorization).toBe("Bearer collector-private-key");
  expect(init.redirect).toBe("error");
  expect(init.signal).toBeDefined();
  expect(init.body).not.toContain("private request body");
  expect(init.body).not.toContain("official@example.com");
});
it("collector failures never replace the application's original error path", async () => {
  vi.stubEnv("ERROR_REPORTING_URL", "http://unsafe.example.test/events");
  vi.stubEnv("ERROR_REPORTING_TOKEN", "test-key");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    captureError(new Error("original"), "failed"),
  ).resolves.toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalled();
});
