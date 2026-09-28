import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import HomePage from "@/app/page";

describe("application entry routing", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends signed-out visitors directly to login", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(HomePage()).rejects.toThrow("redirect:/sign-in");
  });
  it("sends an existing authenticated session directly to the main dashboard", async () => {
    authMock.mockResolvedValue({ userId: "user_verified" });
    await expect(HomePage()).rejects.toThrow("redirect:/app/dashboard");
  });
});
