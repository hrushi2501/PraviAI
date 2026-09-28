import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback({
          session: { withTransaction: mocks.withTransaction },
        }),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import { createServerReportSnapshotAction } from "@/server/actions/snapshot.actions";

const input = {
  authorityId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  snapshotType: "inventory" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (callback) =>
    callback({ execute: mocks.execute }),
  );
  mocks.execute.mockResolvedValue([
    { id: "saved", snapshotType: "inventory", asOfDate: "2026-09-28" },
  ]);
});
describe("Snapshot input trust boundary", () => {
  it("rejects caller totals, attribution and backdated reconstruction", async () => {
    for (const patch of [
      { data: { total: 999 } },
      { createdBy: "forged" },
      { asOfDate: "2020-01-01" },
    ])
      expect(
        (await createServerReportSnapshotAction({ ...input, ...patch }))
          .success,
      ).toBe(false);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
  it("allows only a supported report and validated stable command key", async () => {
    expect(
      (
        await createServerReportSnapshotAction({
          ...input,
          requestId: "invalid",
        })
      ).success,
    ).toBe(false);
    expect((await createServerReportSnapshotAction(input)).success).toBe(true);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
