import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

// Never fall back to DATABASE_URL or DIRECT_URL. A dedicated disposable owner is required.
const target = process.env.PRAVI_DISPOSABLE_OWNER_URL;
if (!target || process.env.PRAVI_ALLOW_DISPOSABLE_TEST !== "1") {
  throw new Error(
    "Set PRAVI_DISPOSABLE_OWNER_URL and PRAVI_ALLOW_DISPOSABLE_TEST=1 for an isolated local test database.",
  );
}
const url = new URL(target);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  !/^\/pravi_test_[a-z0-9_]+$/.test(url.pathname)
) {
  throw new Error(
    "Refusing owner DDL: target must be localhost and a database named pravi_test_*.",
  );
}
const owner = postgres(target, { max: 1, prepare: false });
let actorPool;
try {
  const [present] =
    await owner`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='asset_manager') AS installed`;
  assert.equal(
    present.installed,
    false,
    "Use a fresh disposable database; this harness never resets existing data.",
  );
  await owner.unsafe(
    await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  );
  for (const actor of [
    "ci_admin_a",
    "ci_admin_b",
    "ci_officer_a",
    "ci_officer_b",
    "ci_pending",
  ]) {
    await owner`SELECT asset_manager.sync_identity(${actor}, ${`${actor}@example.test`}, ${actor}, true, clock_timestamp(), 'en')`;
  }
  const [authorityRow] =
    await owner`SELECT asset_manager.bootstrap_authority('CI','Disposable CI Authority','ci_admin_a','ci_admin_b') AS id`;
  const authority = authorityRow.id;
  const [deptA] =
    await owner`INSERT INTO asset_manager.departments(authority_id,code,name,created_by) VALUES(${authority},'A','CI A','ci_admin_a') RETURNING id`;
  const [deptB] =
    await owner`INSERT INTO asset_manager.departments(authority_id,code,name,created_by) VALUES(${authority},'B','CI B','ci_admin_a') RETURNING id`;
  for (const [department, actor] of [
    [deptA.id, "ci_officer_a"],
    [deptB.id, "ci_officer_b"],
  ]) {
    await owner`INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES(${authority},${department},${actor},'officer','ci_admin_a')`;
    await owner`INSERT INTO asset_manager.department_templates(department_id,code,version,name,base_category,fields,components,lifecycle_stages,transitions,policy_reference,status,created_by,submitted_by,approved_by,approved_at)
      SELECT ${department},code,version,'CI road','road',fields,components,lifecycle_stages,transitions,'Synthetic CI policy','published','ci_admin_a','ci_admin_a','ci_admin_b',now() FROM asset_manager.asset_templates WHERE code='road' AND version=1`;
  }
  await owner.unsafe(
    "CREATE ROLE pravi_ci_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'disposable_ci_app_only'",
  );
  await owner.unsafe("GRANT pravi_runtime TO pravi_ci_app");
  url.username = "pravi_ci_app";
  url.password = "disposable_ci_app_only";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_RUNTIME_URL = url.toString();
  delete process.env.DATABASE_URL;
  delete process.env.ALLOW_LEGACY_DATABASE_URL;
  const { createDomainContainer } = await import(
    "../src/server/services/service-factory.ts"
  );
  const { sql } = await import("drizzle-orm");
  const a = createDomainContainer("ci_officer_a");
  const b = createDomainContainer("ci_officer_b");

  const draft = await a.services.assets.registerAsset({
    departmentId: deptA.id,
    assetCode: "CI-1",
    name: "Synthetic CI road",
    templateCode: "road",
    templateVersion: 1,
    sourceReference: "CI disposable fixture",
    attributes: {
      length_km: 1,
      surface: "asphalt",
      start_chainage: "0",
      end_chainage: "1",
    },
  });
  actorPool = globalThis.praviDatabasePools?.runtime?.database.$client;
  assert.ok(
    actorPool,
    "Disposable integration must expose its development pool for cleanup",
  );
  assert.equal(draft.assetCode, "CI-1");
  assert.equal(
    (await a.repositories.assets.findById(draft.id))?.assetCode,
    "CI-1",
  );
  assert.equal(await b.repositories.assets.findById(draft.id), null);
  assert.equal(
    (await b.repositories.assets.findByDepartment(deptA.id)).total,
    0,
  );
  assert.equal(
    (
      await createDomainContainer(
        "ci_pending",
      ).repositories.assets.findByDepartment(deptA.id)
    ).total,
    0,
  );
  await assert.rejects(
    b.services.assets.editAsset({
      assetId: draft.id,
      expectedVersion: draft.versionToken.toNumber(),
      patch: { name: "Cross tenant" },
      reason: "CI denial",
    }),
  );
  const changed = await a.services.assets.editAsset({
    assetId: draft.id,
    expectedVersion: draft.versionToken.toNumber(),
    patch: { name: "Corrected CI road" },
    reason: "CI correction",
  });
  await assert.rejects(
    a.services.assets.editAsset({
      assetId: draft.id,
      expectedVersion: draft.versionToken.toNumber(),
      patch: { name: "Stale edit" },
      reason: "CI conflict",
    }),
  );
  const [{ n: before }] =
    await owner`SELECT count(*)::integer n FROM asset_manager.audit_events WHERE asset_id=${draft.id}`;
  await assert.rejects(
    a.session.withTransaction(async (_tx, procedures) => {
      await procedures.editAsset({
        id: draft.id,
        expectedVersion: changed.versionToken.toNumber(),
        patch: { name: "Must roll back" },
        reason: "CI rollback",
      });
      throw new Error("Injected transaction failure");
    }),
  );
  assert.equal(
    (await a.repositories.assets.findById(draft.id))?.name,
    "Corrected CI road",
  );
  const [{ n: after }] =
    await owner`SELECT count(*)::integer n FROM asset_manager.audit_events WHERE asset_id=${draft.id}`;
  assert.equal(after, before);
  const requestId = crypto.randomUUID();
  const payload = {
    asset_code: "CI-RETRY",
    name: "Retry fixture",
    template_code: "road",
    template_version: 1,
    attributes: {
      length_km: 1,
      surface: "asphalt",
      start_chainage: "0",
      end_chainage: "1",
    },
  };
  const create = () =>
    a.session.withTransaction((_tx, procedures) =>
      procedures.createAsset({
        departmentId: deptA.id,
        data: payload,
        requestId,
      }),
    );
  assert.equal((await create()).id, (await create()).id);
  await assert.rejects(
    a.session.withTransaction((_tx, procedures) =>
      procedures.createAsset({
        departmentId: deptA.id,
        data: { ...payload, name: "Different" },
        requestId,
      }),
    ),
  );
  await a.session.withQuery((tx) =>
    tx.execute(sql`SELECT asset_manager.actor()`),
  );
  const rows = await a.session.client.execute(sql`SELECT current_user`);
  assert.equal(rows[0].current_user, "pravi_ci_app");
  const isolated = await actorPool.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE pravi_runtime");
    return tx.unsafe("SELECT asset_manager.actor() AS actor");
  });
  assert.equal(
    isolated[0].actor,
    null,
    "Actor context must expire outside transaction",
  );
  await assert.rejects(
    a.session.client.execute(sql`SELECT * FROM asset_manager.assets`),
  );
  console.log(
    "PASS: disposable PostgreSQL repository/service mapping, tenant/pending denial, version conflict, mutation+audit rollback, idempotency and transaction-local identity.",
  );
} finally {
  if (actorPool) await actorPool.end();
  await owner.end();
}
