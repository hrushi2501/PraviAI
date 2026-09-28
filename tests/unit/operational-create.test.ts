import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInspection: vi.fn(),
  createWorkOrder: vi.fn(),
  withTransaction: vi.fn(),
}));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown, actorId: string) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback(
          { session: { withTransaction: mocks.withTransaction } },
          "user_verified_actor",
        ),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import {
  createInspectionDraftAction,
  proposeRestorationAction,
} from "@/server/actions/operational-create.actions";

const assetId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (callback) =>
    callback({}, mocks),
  );
});
describe("Operational creation trust contracts", () => {
  it("preserves the retry key and leaves template and review identity to SQL", async () => {
    const input = {
      assetId,
      requestId,
      observedOn: "2026-09-01",
      condition: "unknown" as const,
      observations: {
        roof: {
          condition: "not_assessed" as const,
          notes: "Roof access unavailable",
        },
      },
      templateCode: "forged",
      reviewedBy: "user_self",
    };
    const result = await createInspectionDraftAction(input);
    expect(result.success).toBe(true);
    expect(mocks.createInspection).toHaveBeenCalledWith({
      assetId,
      requestId,
      data: {
        observed_on: "2026-09-01",
        condition: "unknown",
        observations: input.observations,
        limitations: undefined,
        next_review_on: undefined,
      },
    });
  });
  it("binds self assignment to the authenticated actor rather than supplied identity", async () => {
    const result = await proposeRestorationAction({
      assetId,
      requestId,
      description: "Repair roof",
      justification: "Recorded leak",
      assignToSelf: true,
      assignedTo: "forged_user",
    } as Parameters<typeof proposeRestorationAction>[0]);
    expect(result.success).toBe(true);
    expect(mocks.createWorkOrder.mock.calls[0][0].data.assigned_to).toBe(
      "user_verified_actor",
    );
  });
  it("rejects empty work scope and malformed request keys before opening a transaction", async () => {
    expect(
      (
        await proposeRestorationAction({
          assetId,
          requestId,
          description: " ",
          justification: "Reason",
          assignToSelf: false,
        })
      ).success,
    ).toBe(false);
    expect(
      (
        await createInspectionDraftAction({
          assetId,
          requestId: "invalid",
          observedOn: "2026-09-01",
          condition: "unknown",
          observations: {},
        })
      ).success,
    ).toBe(false);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
});
