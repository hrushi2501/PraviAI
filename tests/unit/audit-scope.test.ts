import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: [] as { id: string; name: string }[],
  queryCount: 0,
}));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback({
          session: {
            withQuery: async (query: (tx: unknown) => Promise<unknown>) =>
              query({
                select: () => {
                  mocks.queryCount++;
                  return {
                    from: () => ({
                      where: () => ({ orderBy: async () => mocks.scope }),
                    }),
                  };
                },
              }),
          },
        }),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import { listAuthorityAuditAction } from "@/server/actions/audit.actions";

beforeEach(() => {
  mocks.scope = [];
  mocks.queryCount = 0;
});
describe("Authority-wide audit authorization", () => {
  it("does not query audit records when actor has no administrator scope", async () => {
    const result = await listAuthorityAuditAction({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.denied).toBe(true);
      expect(result.data.rows).toEqual([]);
    }
    expect(mocks.queryCount).toBe(1);
  });
  it("rejects a guessed authority outside the current administrator scopes", async () => {
    mocks.scope = [
      { id: "00000000-0000-4000-8000-000000000001", name: "Allowed" },
    ];
    expect(
      (
        await listAuthorityAuditAction({
          authorityId: "00000000-0000-4000-8000-000000000002",
        })
      ).success,
    ).toBe(false);
    expect(mocks.queryCount).toBe(1);
  });
  it("rejects invalid filters before database queries", async () => {
    expect((await listAuthorityAuditAction({ page: -1 })).success).toBe(false);
    expect(mocks.queryCount).toBe(0);
  });
});
