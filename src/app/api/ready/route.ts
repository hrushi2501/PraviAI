import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, identityDb } from "@/db";
import { productionConfigurationIssues } from "@/lib/env";
import { boundedProbe, releaseIdentity } from "@/lib/health";
import { redis } from "@/lib/redis";

export async function GET() {
  const production = process.env.NODE_ENV === "production";
  const configuration = productionConfigurationIssues().length
    ? "unavailable"
    : "ok";
  const runtimeConfigured = Boolean(
    process.env.DATABASE_RUNTIME_URL ||
      (!production &&
        process.env.ALLOW_LEGACY_DATABASE_URL === "true" &&
        process.env.DATABASE_URL),
  );
  const identityConfigured = Boolean(
    process.env.DATABASE_IDENTITY_URL ||
      (!production &&
        process.env.ALLOW_LEGACY_DATABASE_URL === "true" &&
        process.env.DATABASE_URL),
  );
  const [database, identity, cache] = await Promise.all([
    runtimeConfigured
      ? boundedProbe(() =>
          db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL statement_timeout = '1500ms'`);
            await tx.execute(sql`SET LOCAL ROLE pravi_runtime`);
            await tx.execute(sql`SELECT 1`);
          }),
        )
      : Promise.resolve("unavailable"),
    identityConfigured
      ? boundedProbe(() =>
          identityDb.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL statement_timeout = '1500ms'`);
            await tx.execute(sql`SET LOCAL ROLE pravi_identity_sync`);
            await tx.execute(sql`SELECT 1`);
          }),
        )
      : Promise.resolve("unavailable"),
    redis
      ? boundedProbe(async () => redis?.ping())
      : Promise.resolve(production ? "unavailable" : "not_configured"),
  ]);
  const ready =
    configuration === "ok" &&
    database === "ok" &&
    identity === "ok" &&
    (cache === "ok" || (!production && cache === "not_configured"));
  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      release: releaseIdentity(),
      checks: { configuration, database, identity, redis: cache },
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
