import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  editInspection: vi.fn(),
  editWorkOrder: vi.fn(),
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

import { editInspectionAction } from "@/server/actions/inspection.actions";
import { editWorkOrderAction } from "@/server/actions/work-order.actions";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (callback) =>
    callback({}, mocks),
  );
});
describe("Correction command boundaries", () => {
  it("sends inspection corrections with original version and audited reason through canonical RPC", async () => {
    const patch = {
      observed_on: "2026-09-20",
      condition: "fair" as const,
      observations: {
        surface: { condition: "fair" as const, notes: "Measured surface wear" },
      },
    };
    expect(
      (
        await editInspectionAction({
          id,
          expectedVersion: 4,
          patch,
          reason: " Correct documented findings ",
        })
      ).success,
    ).toBe(true);
    expect(mocks.editInspection).toHaveBeenCalledWith({
      id,
      expectedVersion: 4,
      patch,
      reason: "Correct documented findings",
    });
  });
  it("rejects state/author injection and missing version or reason before mutation", async () => {
    const invalid = {
      id,
      expectedVersion: 0,
      patch: { condition: "good" as const, status: "approved" },
      reason: " ",
    };
    expect((await editInspectionAction(invalid)).success).toBe(false);
    expect(
      (
        await editWorkOrderAction({
          id,
          expectedVersion: 3,
          patch: { description: "Repair", created_by: "user_other" },
          reason: "Change scope",
        } as Parameters<typeof editWorkOrderAction>[0])
      ).success,
    ).toBe(false);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
  it("allows explicitly clearing an executor/deadline while preserving work scope validation", async () => {
    const patch = {
      description: "Repair road shoulders",
      justification: "Field assessment identifies erosion",
      assigned_to: null,
      target_on: null,
    };
    expect(
      (
        await editWorkOrderAction({
          id,
          expectedVersion: 2,
          patch,
          reason: "Correct original proposal",
        })
      ).success,
    ).toBe(true);
    expect(mocks.editWorkOrder).toHaveBeenCalledWith({
      id,
      expectedVersion: 2,
      patch,
      reason: "Correct original proposal",
    });
  });
});
