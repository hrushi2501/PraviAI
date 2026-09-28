import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  type DatabasePurpose,
  resolveDatabaseConnection,
} from "./connection-config";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as {
  praviDatabasePools?: Partial<
    Record<DatabasePurpose, { connectionString: string; database: Database }>
  >;
};
const pools = globalForDb.praviDatabasePools ?? {};
if (process.env.NODE_ENV !== "production")
  globalForDb.praviDatabasePools = pools;

export function isLegacyDevelopmentDatabase(purpose: DatabasePurpose) {
  return resolveDatabaseConnection(purpose, process.env).legacyDevelopment;
}
function getDatabase(purpose: DatabasePurpose): Database {
  const { connectionString } = resolveDatabaseConnection(purpose, process.env);
  const existing = pools[purpose];
  if (existing?.connectionString === connectionString) return existing.database;
  const connection = postgres(connectionString, {
    prepare: false,
    max: purpose === "runtime" ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const database = drizzle(connection, { schema });
  pools[purpose] = { connectionString, database };
  return database;
}
function lazyDatabase(purpose: DatabasePurpose): Database {
  return new Proxy({} as Database, {
    get(_target, property) {
      const database = getDatabase(purpose);
      const value = Reflect.get(database, property);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
}
// Credentials are resolved only on use, so an offline production build remains possible.
export const db = lazyDatabase("runtime");
export const identityDb = lazyDatabase("identity");
