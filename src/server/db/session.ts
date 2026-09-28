import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db, identityDb, isLegacyDevelopmentDatabase } from "@/db";
import type * as schema from "@/db/schema";
import { translateDatabaseError } from "./error-mapper";
import { StoredProcedureGateway } from "./stored-procedures";

export type DbClient = PostgresJsDatabase<typeof schema>;

export class DatabaseSession {
  private constructor(
    public readonly client: DbClient,
    public readonly actorId: string,
    public readonly procedures: StoredProcedureGateway,
  ) {}

  /**
   * Factory method to instantiate a session for a verified Clerk actor ID.
   */
  static forActor(actorId: string): DatabaseSession {
    const gateway = new StoredProcedureGateway(db);
    return new DatabaseSession(db, actorId, gateway);
  }

  /**
   * Factory method for unauthenticated or system-level transactions (e.g. webhooks, outbox workers).
   */
  static system(): DatabaseSession {
    return new DatabaseSession(
      identityDb,
      "system",
      new StoredProcedureGateway(identityDb),
    );
  }

  get isLegacyDevelopmentConnection(): boolean {
    return isLegacyDevelopmentDatabase("identity");
  }

  /**
   * Executes a system-level transaction without asserting actor RLS context.
   */
  async withSystemTransaction<T>(
    callback: (
      tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
      procedures: StoredProcedureGateway,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await identityDb.transaction(async (tx) => {
        // Explicit legacy development compatibility uses the configured owner connection;
        // callers must use narrowly parameterized identity/outbox operations only.
        if (!this.isLegacyDevelopmentConnection)
          await tx.execute(sql`SET LOCAL ROLE pravi_identity_sync;`);
        const txGateway = new StoredProcedureGateway(tx);
        return await callback(tx, txGateway);
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  /**
   * Executes a database transaction with the actor context asserted inside PostgreSQL.
   * Runs under the `pravi_runtime` role with RLS security policies active.
   */
  async withTransaction<T>(
    callback: (
      tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
      procedures: StoredProcedureGateway,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.transaction(async (tx) => {
        // 1. Switch to runtime role with RLS enforced
        await tx.execute(sql`SET LOCAL ROLE pravi_runtime;`);
        // 2. Assert actor identity in session context
        await tx.execute(sql`SELECT asset_manager.set_actor(${this.actorId});`);

        const txGateway = new StoredProcedureGateway(tx);
        return await callback(tx, txGateway);
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  /**
   * Executes an actor-scoped read query inside a transaction ensuring RLS policies apply.
   */
  async withQuery<T>(
    callback: (
      tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0],
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE pravi_runtime;`);
        await tx.execute(sql`SELECT asset_manager.set_actor(${this.actorId});`);
        return await callback(tx);
      });
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }
}
