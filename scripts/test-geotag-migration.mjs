import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const runtime = process.argv[2];
if (!runtime?.startsWith("/"))
  throw new Error("Pass isolated local PGlite runtime path");
const { PGlite } = await import(
  pathToFileURL(`${runtime}/node_modules/@electric-sql/pglite/dist/index.js`)
);
const { pg_trgm } = await import(
  pathToFileURL(
    `${runtime}/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js`,
  )
);
const db = new PGlite({ extensions: { pg_trgm } });
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const rpc = async (actor, name, params = []) => {
  assert.match(name, /^[a-z_]+$/);
  await db.exec("BEGIN; SET LOCAL ROLE pravi_runtime");
  try {
    await query("SELECT asset_manager.set_actor($1)", [actor]);
    const [row] = await query(
      `SELECT * FROM asset_manager.${name}(${params.map((_, i) => `$${i + 1}`).join(",")})`,
      params,
    );
    await db.exec("COMMIT");
    return row;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
};
let count = 0;
const check = async (label, run) => {
  await run();
  count++;
  console.log(`PASS: ${label}`);
};
try {
  await db.exec(
    await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(
      new URL("../migrations/20260928_geotag_command.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const actor of [
    "user_manager",
    "user_reviewer",
    "user_creator",
    "user_other",
  ])
    await query(
      "SELECT asset_manager.sync_identity($1,$2,$1,true,clock_timestamp(),'en')",
      [actor, `${actor}@example.test`],
    );
  const [{ id: authority }] = await query(
    "SELECT asset_manager.bootstrap_authority('GEO_TEST','Geotag Test','user_manager','user_reviewer') AS id",
  );
  await db.exec("BEGIN");
  await query("SELECT asset_manager.internal_assert_actor('user_manager')");
  const [department] = await query(
    "SELECT * FROM asset_manager.create_department($1,'GEO','Geotag Department','user_manager','department_manager',$2)",
    [authority, randomUUID()],
  );
  await query(
    "INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES($1,$2,'user_creator','officer','user_manager'),($1,$2,'user_other','officer','user_manager'),($1,$2,'user_reviewer','senior_approver','user_manager')",
    [authority, department.id],
  );
  await query(
    "INSERT INTO asset_manager.department_templates(department_id,code,version,name,base_category,fields,components,lifecycle_stages,transitions,policy_reference,status,created_by,submitted_by,approved_by,approved_at) SELECT $1,code,version,'Road','road',fields,components,lifecycle_stages,transitions,policy_reference,'published','user_manager','user_manager','user_reviewer',now() FROM asset_manager.asset_templates WHERE code='road' AND version=1",
    [department.id],
  );
  const [{ id: region }] = await query(
    "INSERT INTO asset_manager.regions(authority_id,code,name,level) VALUES($1,'STATE','State','state') RETURNING id",
    [authority],
  );
  await db.exec("COMMIT");
  let asset = await rpc("user_creator", "create_asset", [
    department.id,
    {
      asset_code: "GEO-1",
      name: "Synthetic road",
      template_code: "road",
      template_version: 1,
      attributes: {
        length_km: 1,
        surface: "asphalt",
        start_chainage: "0",
        end_chainage: "1",
      },
      region_id: region,
      source_reference: "Synthetic test register",
      lifecycle_stage: "commissioned",
    },
    randomUUID(),
  ]);
  await check(
    "creator geotag correction keeps canonical version handling",
    async () => {
      asset = await rpc("user_creator", "set_asset_geotag", [
        asset.id,
        asset.version,
        21,
        72,
        "Survey correction",
      ]);
      assert.equal(Number(asset.latitude), 21);
      await assert.rejects(
        rpc("user_creator", "set_asset_geotag", [
          asset.id,
          asset.version - 1,
          22,
          73,
          "Stale correction",
        ]),
        (error) => error.code === "40001",
      );
    },
  );
  await check(
    "another officer cannot edit a creator-owned draft through geotag RPC",
    async () => {
      await assert.rejects(
        rpc("user_other", "set_asset_geotag", [
          asset.id,
          asset.version,
          22,
          73,
          "Other draft correction",
        ]),
      );
    },
  );
  asset = await rpc("user_creator", "transition_asset", [
    asset.id,
    asset.version,
    "submit",
    "Submit reviewed registration",
  ]);
  await check(
    "submitted registration stays frozen for geotag RPC",
    async () => {
      await assert.rejects(
        rpc("user_manager", "set_asset_geotag", [
          asset.id,
          asset.version,
          22,
          73,
          "Frozen correction",
        ]),
      );
    },
  );
  asset = await rpc("user_reviewer", "transition_asset", [
    asset.id,
    asset.version,
    "verify",
    "Independent registration approval",
  ]);
  await check(
    "ordinary officer cannot alter verified coordinates",
    async () => {
      await assert.rejects(
        rpc("user_creator", "set_asset_geotag", [
          asset.id,
          asset.version,
          22,
          73,
          "Verified correction",
        ]),
        (error) => error.code === "42501",
      );
    },
  );
  await check(
    "manager correction invalidates previous verification and requires independent review",
    async () => {
      asset = await rpc("user_manager", "set_asset_geotag", [
        asset.id,
        asset.version,
        22,
        73,
        "Verified survey correction",
      ]);
      assert.equal(asset.registration_status, "submitted");
      assert.equal(asset.verified_by, null);
      assert.equal(asset.verified_at, null);
      assert.equal(asset.submitted_by, "user_manager");
    },
  );
  console.log(
    `Verified ${count} local canonical geotag protection scenarios; no hosted mutations.`,
  );
} finally {
  await db.close();
}
