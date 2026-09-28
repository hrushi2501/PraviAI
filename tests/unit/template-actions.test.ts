import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, transaction } = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    action: (container: unknown) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await action({ session: { withTransaction: transaction } }),
      };
    } catch {
      return { success: false, error: "Rejected" };
    }
  },
}));

import {
  createTemplate,
  transitionTemplate,
} from "@/server/actions/template.actions";

const departmentId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (callback) => callback({ execute }));
  execute.mockResolvedValue([{ version: 2 }]);
});

describe("template command boundaries", () => {
  it("rejects missing decision reasons before issuing a command", async () => {
    const result = await transitionTemplate({
      departmentId,
      code: "road",
      version: 1,
      revision: 1,
      action: "publish",
      reason: "   ",
    });
    expect(result.success).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("passes the precise revision and reason to the canonical decision procedure", async () => {
    const result = await transitionTemplate({
      departmentId,
      code: "road",
      version: 2,
      revision: 4,
      action: "publish",
      reason: "Reviewed engineering standard",
    });
    expect(result.success).toBe(true);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("asset_manager.transition_template");
    expect(query.params).toEqual([
      departmentId,
      "road",
      2,
      4,
      "publish",
      "Reviewed engineering standard",
    ]);
  });

  it("preserves the supplied request identifier for creation retries", async () => {
    await createTemplate({
      departmentId,
      code: "district_road",
      name: "District road",
      base: "road",
      policy: "Department circular 12",
      requestId,
    });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.params).toEqual([
      departmentId,
      "district_road",
      "District road",
      "road",
      JSON.stringify({ policy_reference: "Department circular 12" }),
      requestId,
    ]);
  });
});
