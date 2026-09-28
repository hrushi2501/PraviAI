import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runtimeTransaction: vi.fn(),
  identityTransaction: vi.fn(),
  execute: vi.fn().mockResolvedValue([]),
  legacy: false,
}));
vi.mock("@/db", () => ({
  db: { transaction: mocks.runtimeTransaction },
  identityDb: { transaction: mocks.identityTransaction },
  isLegacyDevelopmentDatabase: () => mocks.legacy,
}));

import { DatabaseSession } from "@/server/db/session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.legacy = false;
  mocks.runtimeTransaction.mockImplementation(async (callback) =>
    callback({ execute: mocks.execute }),
  );
  mocks.identityTransaction.mockImplementation(async (callback) =>
    callback({ execute: mocks.execute }),
  );
});
describe("Runtime and identity transaction boundaries", () => {
  it("actor reads use only runtime pool and assert RLS role/context first", async () => {
    await DatabaseSession.forActor("user_actor").withQuery(async () => "ok");
    expect(mocks.runtimeTransaction).toHaveBeenCalledOnce();
    expect(mocks.identityTransaction).not.toHaveBeenCalled();
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[0][0]).sql).toContain(
      "SET LOCAL ROLE pravi_runtime",
    );
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[1][0]).params).toEqual([
      "user_actor",
    ]);
  });
  it("identity synchronization switches to the dedicated worker pool even from an actor session", async () => {
    await DatabaseSession.forActor("user_actor").withSystemTransaction(
      async () => "ok",
    );
    expect(mocks.identityTransaction).toHaveBeenCalledOnce();
    expect(mocks.runtimeTransaction).not.toHaveBeenCalled();
    expect(
      new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]).sql,
    ).toContain("SET LOCAL ROLE pravi_identity_sync");
  });
  it("explicit legacy development retains pre-migration narrow system compatibility", async () => {
    mocks.legacy = true;
    await DatabaseSession.system().withSystemTransaction(async () => "ok");
    expect(mocks.identityTransaction).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
