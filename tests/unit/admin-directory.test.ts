import { getTableName } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withQuery: vi.fn() }));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown, actor: string) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback(
          { session: { withQuery: mocks.withQuery } },
          "user_admin",
        ),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import { getAdminDirectoryAction } from "@/server/actions/admin-directory.actions";

const authorityId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => vi.clearAllMocks());
it("rejects malformed tenant and page before entering the data transaction", async () => {
  expect(
    (await getAdminDirectoryAction({ authorityId: "other", page: 1 })).success,
  ).toBe(false);
  expect(
    (await getAdminDirectoryAction({ authorityId, page: 0 })).success,
  ).toBe(false);
  expect(mocks.withQuery).not.toHaveBeenCalled();
});
it("denies an unauthorised directory before querying identities", async () => {
  const tables: string[] = [];
  mocks.withQuery.mockImplementation(async (callback) =>
    callback({
      select: () => ({
        from: (table: Parameters<typeof getTableName>[0]) => {
          tables.push(getTableName(table));
          return { where: async () => [{ allowed: false }] };
        },
      }),
    }),
  );
  expect((await getAdminDirectoryAction({ authorityId })).success).toBe(false);
  expect(tables).toEqual(["authorities"]);
});
it("searches the full tenant roster with bounded paging and literal wildcard escaping", async () => {
  const statements: {
    table: string;
    where?: string;
    params?: unknown[];
    offset?: number;
    limit?: number;
  }[] = [];
  let identityRead = 0;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const database = drizzle({} as never);
  const realSelect = database.select.bind(database);
  const tx = {
    select: () => {
      const builder = realSelect();
      const from = builder.from.bind(builder);
      builder.from = ((table: Parameters<typeof getTableName>[0]) => {
        const query = from(table);
        const tableName = getTableName(table);
        query.execute = async () => {
          const compiled = query.toSQL();
          statements.push({
            table: tableName,
            where: compiled.sql,
            params: compiled.params,
          });
          return tableName === "authorities"
            ? [{ allowed: true }]
            : tableName === "identities"
              ? ++identityRead === 1
                ? [{ total: 42 }]
                : []
              : [];
        };
        return query;
      }) as typeof builder.from;
      return builder;
    },
  };
  mocks.withQuery.mockImplementation(async (callback) => callback(tx));
  const result = await getAdminDirectoryAction({
    authorityId,
    page: 2,
    search: "10%_",
  });
  expect(result.success).toBe(true);
  if (result.success)
    expect(result.data).toMatchObject({
      total: 42,
      page: 2,
      pageSize: 20,
      pageCount: 3,
    });
  const identityQueries = statements.filter(
    (item) => item.table === "identities",
  );
  expect(identityQueries).toHaveLength(2);
  expect(identityQueries[1].where).toContain("offset");
  expect(identityQueries[1].params).toContain(20);
  expect(identityQueries[1].params).toContain("%10\\%\\_%");
  expect(identityQueries[1].params).toContain(authorityId);
});
