import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ editAsset: vi.fn() }));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback({
          services: { assets: { editAsset: mocks.editAsset } },
        }),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import { editAssetAction } from "@/server/actions/asset.actions";

const command = {
  assetId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 3,
  reason: " Documented correction ",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.editAsset.mockResolvedValue({
    toJSON: () => ({ id: command.assetId }),
  });
});
describe("Asset server action validation", () => {
  it("denies tenant/state escalation and incomplete coordinate clears before service mutation", async () => {
    for (const patch of [
      { department_id: "forged" },
      { registration_status: "verified" },
      { latitude: null },
      { longitude: 72.5 },
    ])
      expect((await editAssetAction({ ...command, patch })).success).toBe(
        false,
      );
    expect(mocks.editAsset).not.toHaveBeenCalled();
  });
  it("normalizes the reason and accepts an explicit paired location clear", async () => {
    expect(
      (
        await editAssetAction({
          ...command,
          patch: { latitude: null, longitude: null },
        })
      ).success,
    ).toBe(true);
    expect(mocks.editAsset).toHaveBeenCalledWith({
      ...command,
      reason: "Documented correction",
      patch: { latitude: null, longitude: null },
    });
  });
});
