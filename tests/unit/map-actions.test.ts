import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withQuery: vi.fn(), editAsset: vi.fn() }));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback({
          session: { withQuery: mocks.withQuery },
          services: { assets: { editAsset: mocks.editAsset } },
        }),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import {
  getPersistedMapAction,
  updateMapGeotagAction,
} from "@/server/actions/map.actions";

const departmentId = "00000000-0000-4000-8000-000000000001";
const assetId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Persisted map boundaries", () => {
  it.each([
    { departmentId: "synthetic-department" },
    { viewport: { minLat: 24, maxLat: 22, minLng: 70, maxLng: 75 } },
    { viewport: { minLat: 20, maxLat: 24, minLng: 80, maxLng: 75 } },
    { viewport: { minLat: Number.NaN, maxLat: 24, minLng: 70, maxLng: 75 } },
    { pageSize: 1000 },
  ])("rejects invalid scope, viewport or pagination before database access", async (input) => {
    expect((await getPersistedMapAction(input)).success).toBe(false);
    expect(mocks.withQuery).not.toHaveBeenCalled();
  });

  it("scopes every asset query, reports full counts and applies viewport only to paginated points", async () => {
    const queries: Array<{
      fields: Record<string, unknown>;
      where?: SQL;
      limit?: number;
      offset?: number;
    }> = [];
    const tx = {
      select: (fields: Record<string, unknown>) => {
        const state: {
          fields: Record<string, unknown>;
          where?: SQL;
          limit?: number;
          offset?: number;
        } = { fields };
        queries.push(state);
        const query = {
          from() {
            return query;
          },
          leftJoin() {
            return query;
          },
          innerJoin() {
            return query;
          },
          where(clause: SQL) {
            state.where = clause;
            return query;
          },
          orderBy() {
            return query;
          },
          limit(size: number) {
            state.limit = size;
            return query;
          },
          offset(offset: number) {
            state.offset = offset;
            return query;
          },
          // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are thenables; this mock preserves deferred query execution.
          then(resolve: (rows: unknown[]) => unknown) {
            const rows =
              "minLat" in fields
                ? [
                    {
                      total: 401,
                      mapped: 400,
                      unmapped: 1,
                      minLat: "20",
                      minLng: "70",
                      maxLat: "24",
                      maxLng: "75",
                    },
                  ]
                : "assetId" in fields
                  ? [{ assetId, latitude: "21", longitude: "72" }]
                  : "total" in fields
                    ? [{ total: 250 }]
                    : [{ id: departmentId, name: "Department", code: "PWD" }];
            return Promise.resolve(rows).then(resolve);
          },
        };
        return query;
      },
    };
    mocks.withQuery.mockImplementation(async (callback) => callback(tx));
    const result = await getPersistedMapAction({
      departmentId,
      page: 2,
      pageSize: 100,
      viewport: { minLat: 20, maxLat: 24, minLng: 70, maxLng: 75 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.total).toBe(250);
    expect(result.data.pageCount).toBe(3);
    expect(result.data.scopeCounts).toEqual({
      total: 401,
      mapped: 400,
      unmapped: 1,
    });
    expect(result.data.fitBounds).toEqual({
      minLat: 20,
      minLng: 70,
      maxLat: 24,
      maxLng: 75,
    });
    expect(result.data.items[0].latitude).toBe(21);
    const dialect = new PgDialect();
    for (const query of queries.slice(0, 3)) {
      expect(query.where).toBeDefined();
      if (!query.where) continue;
      const predicate = dialect.sqlToQuery(query.where);
      expect(predicate.params).toContain(departmentId);
      expect(predicate.sql).toContain("archived_at");
    }
    const scope = dialect.sqlToQuery(queries[0].where as SQL);
    const points = dialect.sqlToQuery(queries[2].where as SQL);
    expect(scope.params).toEqual([departmentId]);
    expect(points.params).toEqual([departmentId, "20", "24", "70", "75"]);
    expect(queries[2].limit).toBe(100);
    expect(queries[2].offset).toBe(100);
    expect(mocks.withQuery).toHaveBeenCalledOnce();
  });

  it("requires valid coordinates/version/reason and routes corrections through canonical asset editing", async () => {
    mocks.editAsset.mockResolvedValue({
      toJSON: () => ({ id: assetId, version: 3 }),
    });
    expect(
      (
        await updateMapGeotagAction({
          assetId,
          expectedVersion: 2,
          latitude: 21,
          longitude: 72,
          reason: "Correct surveyed coordinates",
        })
      ).success,
    ).toBe(true);
    expect(mocks.editAsset).toHaveBeenCalledWith({
      assetId,
      expectedVersion: 2,
      patch: { latitude: 21, longitude: 72 },
      reason: "Correct surveyed coordinates",
    });
    mocks.editAsset.mockClear();
    expect(
      (
        await updateMapGeotagAction({
          assetId,
          expectedVersion: 2,
          latitude: 91,
          longitude: 72,
          reason: "",
        })
      ).success,
    ).toBe(false);
    expect(mocks.editAsset).not.toHaveBeenCalled();
  });
});
