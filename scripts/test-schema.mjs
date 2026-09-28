import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// A disposable, local PostgreSQL runtime; this script never uses DATABASE_URL.
const runtime = process.argv[2];
if (!runtime?.startsWith("/")) {
  throw new Error("Pass the absolute path to an isolated PGlite installation.");
}
const { PGlite } = await import(
  pathToFileURL(`${runtime}/node_modules/@electric-sql/pglite/dist/index.js`)
);
const { pg_trgm } = await import(
  pathToFileURL(
    `${runtime}/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js`,
  )
);
const db = new PGlite({ extensions: { pg_trgm } });
const schema = await readFile(
  new URL("../schema.sql", import.meta.url),
  "utf8",
);
let passed = 0;

async function query(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS: ${name}`);
}

async function asActor(actor, run, role = "pravi_runtime") {
  assert.ok(["pravi_runtime", "pravi_identity_sync", "anon"].includes(role));
  await db.exec(`BEGIN; SET LOCAL ROLE ${role}`);
  try {
    if (actor !== null) {
      await query("SELECT asset_manager.set_actor($1)", [actor]);
    }
    const result = await run();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function rpc(actor, name, args = []) {
  assert.match(name, /^[a-z_]+$/);
  return asActor(actor, async () => {
    const rows = await query(
      `SELECT * FROM asset_manager.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`,
      args,
    );
    return rows[0];
  });
}

async function denied(actor, name, args = []) {
  await assert.rejects(rpc(actor, name, args), (error) => {
    // Missing signatures or SQL bugs must never masquerade as access denial.
    assert.ok(
      !["42883", "42601", "42703", "42P01", "42702"].includes(error.code),
      error.message,
    );
    return true;
  });
}

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await check("complete one-run SQL installs locally", () => db.exec(schema));
  await check(
    "repeat install is refused without deleting installed objects",
    async () => {
      const before = await query(`SELECT count(*)::int AS n FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='asset_manager' AND c.relkind IN ('r','p')`);
      await assert.rejects(db.exec(schema));
      await db.exec("ROLLBACK");
      assert.deepEqual(
        await query(`SELECT count(*)::int AS n FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='asset_manager' AND c.relkind IN ('r','p')`),
        before,
      );
    },
  );
  await check(
    "runtime roles cannot bypass RLS or log in independently",
    async () => {
      const roles =
        await query(`SELECT rolname, rolcanlogin, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname IN ('pravi_runtime','pravi_identity_sync')`);
      assert.equal(roles.length, 2);
      for (const role of roles) {
        assert.equal(role.rolcanlogin, false);
        assert.equal(role.rolsuper, false);
        assert.equal(role.rolbypassrls, false);
      }
    },
  );
  await check("runtime cannot mutate tables directly", async () => {
    assert.deepEqual(
      await query(`SELECT c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='asset_manager' AND c.relkind IN ('r','p')
        AND has_table_privilege('pravi_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')`),
      [],
    );
  });
  await check(
    "Supabase browser roles have no application table privileges",
    async () => {
      assert.deepEqual(
        await query(`SELECT c.relname, r.rolname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN pg_roles r
        WHERE n.nspname='asset_manager' AND c.relkind IN ('r','p')
        AND r.rolname IN ('anon','authenticated','service_role')
        AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`),
        [],
      );
    },
  );
  await check("anonymous callers cannot set actor context", async () => {
    await assert.rejects(
      asActor(
        null,
        () => query("SELECT asset_manager.set_actor('user_test')"),
        "anon",
      ),
    );
  });
  await check("all application tables have RLS", async () => {
    assert.deepEqual(
      await query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='asset_manager' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity`),
      [],
    );
  });

  const names = [
    "admin",
    "admin_two",
    "planner",
    "manager_a",
    "senior_a",
    "officer_a",
    "manager_b",
    "senior_b",
    "officer_b",
    "outsider",
    "acceptor_a",
  ];
  await check(
    "signed identity worker provisions verified identities",
    async () => {
      for (const name of names) {
        await asActor(
          null,
          () =>
            query("SELECT asset_manager.sync_identity($1,$2,$3,true,$4,'en')", [
              `user_${name}`,
              `${name}@example.test`,
              name,
              "2026-01-01T00:00:00Z",
            ]),
          "pravi_identity_sync",
        );
      }
      assert.equal(
        (await query("SELECT count(*)::int n FROM asset_manager.identities"))[0]
          .n,
        names.length,
      );
    },
  );
  let authority;
  await check(
    "owner bootstrap completes including composite-key audit records",
    async () => {
      authority = (
        await query(
          "SELECT asset_manager.bootstrap_authority('TEST','Synthetic authority','user_admin','user_admin_two') AS id",
        )
      )[0].id;
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM asset_manager.role_definitions WHERE authority_id=$1",
            [authority],
          )
        )[0].n,
        6,
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM asset_manager.audit_events WHERE entity_id IS NULL",
          )
        )[0].n,
        0,
      );
      await query(
        "INSERT INTO asset_manager.authority_memberships(authority_id,clerk_id,role,granted_by) VALUES($1,'user_planner','central_planner','user_admin')",
        [authority],
      );
    },
  );
  const deptA = randomUUID();
  const deptB = randomUUID();
  const region = randomUUID();
  const stateRegion = randomUUID();
  await query(
    "INSERT INTO asset_manager.departments(id,authority_id,code,name,created_by) VALUES($1,$3,'A','Synthetic Roads','user_admin'),($2,$3,'B','Synthetic Buildings','user_admin')",
    [deptA, deptB, authority],
  );
  await query(
    "INSERT INTO asset_manager.regions(id,authority_id,code,name,level) VALUES($1,$2,'STATE','Synthetic State','state')",
    [stateRegion, authority],
  );
  await query(
    "INSERT INTO asset_manager.regions(id,authority_id,parent_id,code,name,level) VALUES($1,$2,$3,'REGION','Synthetic District','district')",
    [region, authority, stateRegion],
  );
  for (const [dept, suffix] of [
    [deptA, "a"],
    [deptB, "b"],
  ]) {
    for (const [user, role] of [
      [`user_manager_${suffix}`, "department_manager"],
      [`user_senior_${suffix}`, "senior_approver"],
      [`user_officer_${suffix}`, "officer"],
    ]) {
      await query(
        "INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES($1,$2,$3,$4,'user_admin')",
        [authority, dept, user, role],
      );
    }
    await query(
      `INSERT INTO asset_manager.department_templates(department_id,code,version,name,base_category,fields,components,lifecycle_stages,transitions,policy_reference,status,created_by,submitted_by,approved_by,approved_at)
      SELECT $1,'road',1,'Road','road',fields,components,lifecycle_stages,
      '[{"from":"planned","to":"construction","permission":"asset_write","requires_approval":true},{"from":"construction","to":"commissioned","permission":"asset_write","requires_approval":true},{"from":"commissioned","to":"retired","permission":"asset_write","requires_approval":true,"retire":true}]'::jsonb,
      policy_reference,'published',$2,$2,$3,now() FROM asset_manager.asset_templates WHERE code='road' AND version=1`,
      [dept, `user_manager_${suffix}`, `user_senior_${suffix}`],
    );
  }
  await query(
    "INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES($1,$2,'user_acceptor_a','senior_approver','user_admin')",
    [authority, deptA],
  );
  let assetA;
  let assetB;
  const assetPayload = (code) => ({
    asset_code: code,
    name: `Synthetic ${code}`,
    template_code: "road",
    template_version: 1,
    attributes: {
      length_km: 1,
      surface: "asphalt",
      start_chainage: "0",
      end_chainage: "1",
    },
    region_id: region,
    source_reference: "Synthetic register",
    lifecycle_stage: "commissioned",
  });
  await check(
    "two departments create independently scoped assets",
    async () => {
      assetA = await rpc("user_officer_a", "create_asset", [
        deptA,
        assetPayload("ROAD-A"),
        randomUUID(),
      ]);
      assetB = await rpc("user_officer_b", "create_asset", [
        deptB,
        assetPayload("ROAD-B"),
        randomUUID(),
      ]);
      assert.equal(assetA.department_id, deptA);
      assert.equal(assetB.department_id, deptB);
    },
  );
  await check(
    "central planner requires an independently approved explicit grant",
    async () => {
      assert.deepEqual(
        await asActor("user_planner", () =>
          query("SELECT id FROM asset_manager.assets"),
        ),
        [],
      );
      const grant = await rpc("user_admin", "request_central_read", [
        authority,
        null,
        "user_planner",
        true,
        "Planning oversight",
        randomUUID(),
      ]);
      await denied("user_admin", "decide_central_read", [
        grant.id,
        true,
        "Self",
      ]);
      assert.deepEqual(
        await asActor("user_planner", () =>
          query("SELECT id FROM asset_manager.assets"),
        ),
        [],
      );
      await rpc("user_admin_two", "decide_central_read", [
        grant.id,
        true,
        "Independent grant",
      ]);
    },
  );
  await check("department RLS, central read and unassigned deny", async () => {
    for (const [actor, expected] of [
      ["user_officer_a", [assetA.id]],
      ["user_officer_b", [assetB.id]],
      ["user_planner", [assetA.id, assetB.id]],
      ["user_outsider", []],
    ]) {
      const rows = await asActor(actor, () =>
        query("SELECT id FROM asset_manager.assets ORDER BY id"),
      );
      assert.deepEqual(rows.map((r) => r.id).sort(), expected.sort());
    }
    assert.deepEqual(
      await asActor(null, () => query("SELECT id FROM asset_manager.assets")),
      [],
    );
  });
  await check(
    "actor scope expires on pooled transaction boundary",
    async () => {
      await asActor("user_officer_a", () =>
        query("SELECT id FROM asset_manager.assets"),
      );
      assert.deepEqual(
        await asActor(null, () => query("SELECT id FROM asset_manager.assets")),
        [],
      );
    },
  );
  await check("direct actor GUC forgery cannot widen access", async () => {
    await asActor("user_officer_a", async () => {
      await query("SELECT set_config('pravi.actor_id','user_admin',true)");
      assert.equal(
        (await query("SELECT asset_manager.actor() AS actor"))[0].actor,
        "user_officer_a",
      );
      assert.deepEqual(
        (await query("SELECT id FROM asset_manager.assets")).map((r) => r.id),
        [assetA.id],
      );
      await assert.rejects(
        query("SELECT asset_manager.set_actor('user_admin')"),
      );
    });
  });
  await check("cross-tenant and central-planner mutations denied", async () => {
    await denied("user_officer_b", "edit_asset", [
      assetA.id,
      assetA.version,
      { name: "Illegal" },
      "Test",
    ]);
    await denied("user_planner", "edit_asset", [
      assetA.id,
      assetA.version,
      { name: "Illegal" },
      "Test",
    ]);
    await denied("user_officer_a", "create_asset", [
      deptB,
      assetPayload("ILLEGAL"),
      randomUUID(),
    ]);
    await assert.rejects(
      asActor("user_officer_a", () =>
        query("UPDATE asset_manager.assets SET name='Illegal' WHERE id=$1", [
          assetA.id,
        ]),
      ),
    );
  });
  await check(
    "internal helper and owner bootstrap cannot be called by runtime",
    async () => {
      await denied("user_admin", "bootstrap_authority", [
        "BAD",
        "Bad",
        "user_admin",
        "user_admin_two",
      ]);
      await denied("user_admin", "create_department", [
        authority,
        "BAD",
        "Bad",
        "user_manager_a",
        "department_manager",
        randomUUID(),
      ]);
      await denied("user_admin", "set_authority_member", [
        authority,
        "user_outsider",
        "authority_admin",
        true,
        "Bad",
      ]);
      await denied("user_officer_a", "finish_request", [
        randomUUID(),
        { id: assetA.id },
      ]);
    },
  );
  await check(
    "idempotent create returns original asset, payload mismatch denied",
    async () => {
      const request = randomUUID();
      const payload = assetPayload("IDEMPOTENT");
      const first = await rpc("user_officer_a", "create_asset", [
        deptA,
        payload,
        request,
      ]);
      const second = await rpc("user_officer_a", "create_asset", [
        deptA,
        payload,
        request,
      ]);
      assert.equal(first.id, second.id);
      await denied("user_officer_a", "create_asset", [
        deptA,
        { ...payload, name: "Different" },
        request,
      ]);
    },
  );
  await check(
    "asset hierarchy blocks cycles, cross-tenant parents and invalid measures",
    async () => {
      let child = await rpc("user_officer_a", "create_asset", [
        deptA,
        assetPayload("CHILD"),
        randomUUID(),
      ]);
      assetA = await rpc("user_officer_a", "set_asset_management", [
        assetA.id,
        assetA.version,
        {
          parent_asset_id: child.id,
          measure_value: 1,
          measure_unit: "km",
          responsible_officer: "user_officer_a",
        },
        "Management details",
      ]);
      await denied("user_officer_a", "set_asset_management", [
        child.id,
        child.version,
        { parent_asset_id: assetA.id },
        "Cycle",
      ]);
      await denied("user_officer_a", "set_asset_management", [
        child.id,
        child.version,
        { parent_asset_id: assetB.id },
        "Cross tenant",
      ]);
      await denied("user_officer_a", "set_asset_management", [
        child.id,
        child.version,
        { measure_value: -1, measure_unit: "km" },
        "Invalid",
      ]);
      await denied("user_officer_a", "set_asset_management", [
        child.id,
        child.version,
        { responsible_officer: "user_officer_b" },
        "Wrong officer",
      ]);
      const duplicatePeer = await rpc("user_officer_a", "create_asset", [
        deptA,
        assetPayload("DUPLICATE-PEER"),
        randomUUID(),
      ]);
      const duplicate = await rpc("user_officer_a", "flag_duplicate", [
        duplicatePeer.id,
        child.id,
        "Potential same location",
      ]);
      await denied("user_officer_a", "review_duplicate", [
        duplicate.id,
        true,
        "Self",
      ]);
      await rpc("user_senior_a", "review_duplicate", [
        duplicate.id,
        true,
        "Independently confirmed",
      ]);
      child = (
        await query("SELECT * FROM asset_manager.assets WHERE id=$1", [
          child.id,
        ])
      )[0];
      assert.equal(child.archived_at, null);
    },
  );
  await check(
    "optimistic conflict and protected payload fields fail atomically",
    async () => {
      const before = assetA;
      await denied("user_officer_a", "edit_asset", [
        assetA.id,
        assetA.version + 50,
        { name: "Changed" },
        "Test",
      ]);
      await denied("user_officer_a", "edit_asset", [
        assetA.id,
        assetA.version,
        { department_id: deptB },
        "Test",
      ]);
      assetA = (
        await query("SELECT * FROM asset_manager.assets WHERE id=$1", [
          assetA.id,
        ])
      )[0];
      assert.equal(assetA.version, before.version);
      assert.equal(assetA.name, before.name);
    },
  );
  await check(
    "manager cannot promote self or invite privileged approver",
    async () => {
      await denied("user_manager_a", "set_department_member", [
        deptA,
        "user_manager_a",
        "senior_approver",
        true,
        "Test",
      ]);
      await denied("user_manager_a", "create_invitation", [
        deptA,
        "privileged@example.test",
        "senior_approver",
        new Date(Date.now() + 86400000).toISOString(),
        randomUUID(),
      ]);
    },
  );
  await check(
    "department creation stays pending until independent governance approval",
    async () => {
      const request = await rpc("user_admin", "request_governance", [
        authority,
        "department_create",
        {
          code: "NEW",
          name: "New Department",
          manager: "user_manager_a",
          manager_role: "department_manager",
        },
        "Synthetic request",
        randomUUID(),
      ]);
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM asset_manager.departments WHERE code='NEW'",
          )
        )[0].n,
        0,
      );
      await denied("user_admin", "decide_governance", [
        request.id,
        true,
        "Self approval",
      ]);
      const approved = await rpc("user_admin_two", "decide_governance", [
        request.id,
        true,
        "Independent approval",
      ]);
      assert.equal(approved.status, "approved");
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM asset_manager.departments WHERE code='NEW'",
          )
        )[0].n,
        1,
      );
    },
  );
  await check(
    "governance changes cannot leave one person as their own sole approver",
    async () => {
      const removal = await rpc("user_admin", "request_governance", [
        authority,
        "authority_member",
        { clerk_id: "user_admin_two", role: "authority_admin", active: false },
        "Attempt single administrator",
        randomUUID(),
      ]);
      await denied("user_admin_two", "decide_governance", [
        removal.id,
        true,
        "Approve removal",
      ]);
      assert.equal(
        (
          await query(
            "SELECT active FROM asset_manager.authority_memberships WHERE authority_id=$1 AND clerk_id='user_admin_two'",
            [authority],
          )
        )[0].active,
        true,
      );
    },
  );
  await check("role with ten assigned users cannot retire", async () => {
    const request = await rpc("user_admin", "request_governance", [
      authority,
      "role_create",
      {
        code: "regional_viewer",
        name: "Regional Viewer",
        scope: "department",
        permissions: ["read"],
      },
      "Test",
      randomUUID(),
    ]);
    await rpc("user_admin_two", "decide_governance", [
      request.id,
      true,
      "Approved",
    ]);
    for (let i = 0; i < 10; i++) {
      await query(
        "INSERT INTO asset_manager.identities(clerk_id,email,email_verified,display_name,source_updated_at) VALUES($1,$2,true,$3,now())",
        [`user_assigned_${i}`, `assigned_${i}@example.test`, `Assigned ${i}`],
      );
      await query(
        "INSERT INTO asset_manager.department_memberships(authority_id,department_id,clerk_id,role,granted_by) VALUES($1,$2,$3,'regional_viewer','user_admin')",
        [authority, deptA, `user_assigned_${i}`],
      );
    }
    await denied("user_admin", "request_governance", [
      authority,
      "role_retire",
      { code: "regional_viewer", expected_version: 1 },
      "Retire",
      randomUUID(),
    ]);
    assert.equal(
      (
        await query(
          "SELECT active FROM asset_manager.role_definitions WHERE authority_id=$1 AND code='regional_viewer'",
          [authority],
        )
      )[0].active,
      true,
    );
  });
  await check(
    "custom date/boolean template publishes independently and starts at its first stage",
    async () => {
      const definition = {
        fields: [
          { key: "inspection_date", type: "date", required: true },
          { key: "has_access", type: "boolean", required: true },
        ],
        components: ["general"],
        lifecycle_stages: ["surveyed", "operational", "retired"],
        transitions: [
          {
            from: "surveyed",
            to: "operational",
            permission: "asset_write",
            requires_approval: true,
          },
        ],
        policy_reference: "Synthetic custom policy",
      };
      let template = await rpc("user_manager_a", "create_department_template", [
        deptA,
        "custom",
        "Custom fixed asset",
        "other",
        definition,
        randomUUID(),
      ]);
      template = await rpc("user_manager_a", "transition_template", [
        deptA,
        "custom",
        1,
        template.revision,
        "submit",
        "Submit",
      ]);
      await denied("user_manager_a", "transition_template", [
        deptA,
        "custom",
        1,
        template.revision,
        "publish",
        "Self",
      ]);
      await rpc("user_senior_a", "transition_template", [
        deptA,
        "custom",
        1,
        template.revision,
        "publish",
        "Approved",
      ]);
      const payload = {
        asset_code: "CUSTOM",
        name: "Custom",
        template_code: "custom",
        attributes: { inspection_date: "2026-01-01", has_access: false },
      };
      const custom = await rpc("user_officer_a", "create_asset", [
        deptA,
        payload,
        randomUUID(),
      ]);
      assert.equal(custom.lifecycle_stage, "surveyed");
      await denied("user_officer_a", "create_asset", [
        deptA,
        {
          ...payload,
          asset_code: "INVALID-DATE",
          attributes: { ...payload.attributes, inspection_date: "2026-02-30" },
        },
        randomUUID(),
      ]);
      await denied("user_officer_a", "create_asset", [
        deptA,
        {
          ...payload,
          asset_code: "INVALID-BOOL",
          attributes: { ...payload.attributes, has_access: "false" },
        },
        randomUUID(),
      ]);
    },
  );
  await check(
    "independent asset verification and submitted draft freeze",
    async () => {
      assetA = await rpc("user_officer_a", "transition_asset", [
        assetA.id,
        assetA.version,
        "submit",
        "Registered",
      ]);
      await denied("user_officer_a", "edit_asset", [
        assetA.id,
        assetA.version,
        { name: "Frozen" },
        "Test",
      ]);
      await denied("user_officer_a", "transition_asset", [
        assetA.id,
        assetA.version,
        "verify",
        "Self",
      ]);
      assetA = await rpc("user_manager_a", "transition_asset", [
        assetA.id,
        assetA.version,
        "verify",
        "Independently checked",
      ]);
      assert.equal(assetA.registration_status, "verified");
    },
  );
  await check(
    "verified correction requires independent registration review again",
    async () => {
      assetA = await rpc("user_manager_a", "edit_asset", [
        assetA.id,
        assetA.version,
        { name: "Corrected Synthetic Road" },
        "Correct documentary spelling",
      ]);
      assert.equal(assetA.registration_status, "submitted");
      assert.equal(assetA.verified_by, null);
      await denied("user_manager_a", "transition_asset", [
        assetA.id,
        assetA.version,
        "verify",
        "Self",
      ]);
      assetA = await rpc("user_senior_a", "transition_asset", [
        assetA.id,
        assetA.version,
        "verify",
        "Independent correction review",
      ]);
    },
  );
  let inspection;
  const evidencePayload = (key, extra = {}) => ({
    provider: "supabase_private",
    object_key: `${deptA}/${key}`,
    original_name: "Synthetic.pdf",
    mime_type: "application/pdf",
    size_bytes: 1200,
    classification: "internal",
    ...extra,
  });
  await check(
    "evidence enforces private provider and department object prefix",
    async () => {
      await denied("user_officer_a", "attach_evidence", [
        assetA.id,
        evidencePayload("cloudinary", {
          provider: "cloudinary",
          classification: "internal",
        }),
        randomUUID(),
      ]);
      await denied("user_officer_a", "attach_evidence", [
        assetA.id,
        evidencePayload("cross", { object_key: `${deptB}/wrong.pdf` }),
        randomUUID(),
      ]);
      await rpc("user_officer_a", "attach_evidence", [
        assetA.id,
        evidencePayload("registration.pdf"),
        randomUUID(),
      ]);
    },
  );
  await check(
    "inspection needs evidence and independent approval",
    async () => {
      inspection = await rpc("user_officer_a", "create_inspection", [
        assetA.id,
        {
          observed_on: "2026-01-01",
          next_review_on: "2099-01-01",
          condition: "poor",
          observations: {
            surface: { condition: "poor", notes: "Synthetic potholes" },
            drainage: { condition: "good" },
            shoulders: { condition: "fair" },
          },
        },
        randomUUID(),
      ]);
      await denied("user_officer_a", "transition_inspection", [
        inspection.id,
        inspection.version,
        "submit",
        "Missing evidence",
      ]);
      await rpc("user_officer_a", "attach_evidence", [
        assetA.id,
        evidencePayload("inspection.pdf", {
          inspection_id: inspection.id,
          classification: "restricted",
        }),
        randomUUID(),
      ]);
      inspection = await rpc("user_officer_a", "transition_inspection", [
        inspection.id,
        inspection.version,
        "submit",
        "Assessed",
      ]);
      await denied("user_officer_a", "transition_inspection", [
        inspection.id,
        inspection.version,
        "approve",
        "Self",
      ]);
      inspection = await rpc("user_senior_a", "transition_inspection", [
        inspection.id,
        inspection.version,
        "approve",
        "Reviewed",
      ]);
      assert.equal(inspection.status, "approved");
      await denied("user_officer_a", "edit_inspection", [
        inspection.id,
        inspection.version,
        { condition: "good" },
        "Rewrite",
      ]);
    },
  );
  await check(
    "restricted evidence and reporting views retain RLS",
    async () => {
      assert.equal(
        (
          await asActor("user_planner", () =>
            query(
              "SELECT count(*)::int n FROM asset_manager.evidence WHERE classification='restricted'",
            ),
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await asActor("user_senior_a", () =>
            query(
              "SELECT count(*)::int n FROM asset_manager.evidence WHERE classification='restricted'",
            ),
          )
        )[0].n,
        1,
      );
      const rows = await asActor("user_officer_b", () =>
        query("SELECT asset_id FROM asset_manager.asset_current_condition"),
      );
      assert.deepEqual(
        rows.map((r) => r.asset_id),
        [assetB.id],
      );
      const condition = await asActor("user_officer_a", () =>
        query(
          "SELECT current_condition FROM asset_manager.asset_current_condition WHERE asset_id=$1",
          [assetA.id],
        ),
      );
      assert.equal(condition[0].current_condition, "poor");
    },
  );
  await check(
    "reviewed estimate uses integer paise and restored work does not invent condition",
    async () => {
      let work = await rpc("user_officer_a", "create_work_order", [
        assetA.id,
        {
          description: "Synthetic restoration",
          justification: "Approved poor observation",
          inspection_id: inspection.id,
          assigned_to: "user_officer_a",
          target_on: "2099-01-01",
        },
        randomUUID(),
      ]);
      const estimate = await rpc("user_officer_a", "create_work_estimate", [
        work.id,
        1234567,
        "Synthetic estimate",
        "Demonstration basis",
        "2026-01-01",
        randomUUID(),
      ]);
      await denied("user_officer_a", "review_work_estimate", [
        estimate.id,
        true,
        "Self",
      ]);
      await rpc("user_senior_a", "review_work_estimate", [
        estimate.id,
        true,
        "Reviewed",
      ]);
      const totals = await asActor("user_officer_a", () =>
        query(
          "SELECT sum(reviewed_estimate_paise)::text AS total FROM asset_manager.regional_restoration_summary",
        ),
      );
      assert.equal(totals[0].total, "1234567");
      work = await rpc("user_senior_a", "transition_work_order", [
        work.id,
        work.version,
        "approve",
        {},
        "Approved",
      ]);
      work = await rpc("user_officer_a", "transition_work_order", [
        work.id,
        work.version,
        "start",
        {},
        "Started",
      ]);
      await rpc("user_officer_a", "attach_evidence", [
        assetA.id,
        evidencePayload("work.pdf", { work_order_id: work.id }),
        randomUUID(),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      work = await rpc("user_officer_a", "transition_work_order", [
        work.id,
        work.version,
        "submit_completion",
        {
          completed_on: today,
          actual_cost_paise: 1200000,
          completion_notes: "Synthetic completion",
        },
        "Completed",
      ]);
      await denied("user_officer_a", "transition_work_order", [
        work.id,
        work.version,
        "accept",
        {},
        "Self",
      ]);
      work = await rpc("user_acceptor_a", "transition_work_order", [
        work.id,
        work.version,
        "accept",
        {},
        "Accepted",
      ]);
      assert.equal(work.status, "accepted");
      assert.equal(
        (
          await asActor("user_officer_a", () =>
            query(
              "SELECT current_condition FROM asset_manager.asset_current_condition WHERE asset_id=$1",
              [assetA.id],
            ),
          )
        )[0].current_condition,
        "poor",
      );
      await denied("user_senior_a", "link_work_verification", [
        work.id,
        work.version,
        inspection.id,
        "Old finding",
      ]);
      let verification = await rpc("user_manager_a", "create_inspection", [
        assetA.id,
        {
          observed_on: today,
          next_review_on: "2099-01-01",
          condition: "fair",
          observations: {
            surface: { condition: "fair" },
            drainage: { condition: "good" },
            shoulders: { condition: "fair" },
          },
        },
        randomUUID(),
      ]);
      await rpc("user_manager_a", "attach_evidence", [
        assetA.id,
        evidencePayload("verification.pdf", { inspection_id: verification.id }),
        randomUUID(),
      ]);
      verification = await rpc("user_manager_a", "transition_inspection", [
        verification.id,
        verification.version,
        "submit",
        "Post work verification",
      ]);
      verification = await rpc("user_senior_a", "transition_inspection", [
        verification.id,
        verification.version,
        "approve",
        "Independent finding",
      ]);
      await rpc("user_senior_a", "link_work_verification", [
        work.id,
        work.version,
        verification.id,
        "Independent post-work evidence",
      ]);
      assert.equal(
        (
          await asActor("user_officer_a", () =>
            query(
              "SELECT current_condition FROM asset_manager.asset_current_condition WHERE asset_id=$1",
              [assetA.id],
            ),
          )
        )[0].current_condition,
        "fair",
      );
    },
  );
  await check(
    "unmatched complaints retain evidence then link within the same tenant",
    async () => {
      let complaint = await rpc("user_officer_a", "create_complaint", [
        deptA,
        {
          channel: "phone",
          reported_at: "2026-01-01T00:00:00Z",
          narrative: "Synthetic complaint about location",
          reported_severity: "high",
        },
        randomUUID(),
      ]);
      const attachment = await rpc(
        "user_officer_a",
        "attach_complaint_evidence",
        [complaint.id, evidencePayload("unmatched.pdf"), randomUUID()],
      );
      assert.equal(attachment.asset_id, null);
      await denied("user_officer_a", "edit_complaint", [
        complaint.id,
        complaint.version,
        { asset_id: assetB.id },
        "Wrong tenant",
      ]);
      complaint = await rpc("user_officer_a", "edit_complaint", [
        complaint.id,
        complaint.version,
        { asset_id: assetA.id, assigned_to: "user_officer_a" },
        "Identified asset",
      ]);
      complaint = await rpc("user_officer_a", "transition_complaint", [
        complaint.id,
        complaint.version,
        "triaged",
        "Checked",
      ]);
      complaint = await rpc("user_officer_a", "transition_complaint", [
        complaint.id,
        complaint.version,
        "investigating",
        "Investigating",
      ]);
      await denied("user_officer_a", "transition_complaint", [
        complaint.id,
        complaint.version,
        "resolved",
        "Self closing severe complaint",
      ]);
      complaint = await rpc("user_senior_a", "transition_complaint", [
        complaint.id,
        complaint.version,
        "resolved",
        "Reviewed approved investigation",
      ]);
      assert.equal(complaint.status, "resolved");
      const access = await rpc("user_manager_a", "request_evidence_access", [
        attachment.id,
        "Review complaint evidence",
      ]);
      assert.equal(
        access.request_evidence_access.object_key,
        attachment.object_key,
      );
      await assert.rejects(
        asActor("user_manager_a", () =>
          query("SELECT object_key FROM asset_manager.evidence"),
        ),
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM asset_manager.evidence_access_events WHERE evidence_id=$1",
            [attachment.id],
          )
        )[0].n,
        1,
      );
    },
  );
  await check(
    "Clerk invitation worker binds email, role, and accepted membership",
    async () => {
      const invitation = await rpc("user_manager_a", "create_invitation", [
        deptA,
        "outsider@example.test",
        "officer",
        new Date(Date.now() + 86400000).toISOString(),
        randomUUID(),
      ]);
      await asActor(
        null,
        () =>
          query("SELECT asset_manager.invitation_delivered($1,'inv_test')", [
            invitation.id,
          ]),
        "pravi_identity_sync",
      );
      await assert.rejects(
        asActor(
          null,
          () =>
            query(
              "SELECT asset_manager.accept_invitation($1,'inv_test','user_officer_b')",
              [invitation.id],
            ),
          "pravi_identity_sync",
        ),
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.accept_invitation($1,'inv_test','user_outsider')",
            [invitation.id],
          ),
        "pravi_identity_sync",
      );
      assert.equal(
        (
          await query(
            "SELECT role FROM asset_manager.department_memberships WHERE department_id=$1 AND clerk_id='user_outsider'",
            [deptA],
          )
        )[0].role,
        "officer",
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.accept_invitation($1,'inv_test','user_outsider')",
            [invitation.id],
          ),
        "pravi_identity_sync",
      );
    },
  );
  await check(
    "invitation reactivates an inactive membership without rewriting creation time",
    async () => {
      await query(
        "UPDATE asset_manager.department_memberships SET active=false,created_at='2020-01-01T00:00:00Z',updated_at='2020-01-01T00:00:00Z' WHERE department_id=$1 AND clerk_id='user_outsider'",
        [deptA],
      );
      const invitation = await rpc("user_manager_a", "create_invitation", [
        deptA,
        "outsider@example.test",
        "officer",
        new Date(Date.now() + 86400000).toISOString(),
        randomUUID(),
      ]);
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.invitation_delivered($1,'inv_reactivate')",
            [invitation.id],
          ),
        "pravi_identity_sync",
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.accept_invitation($1,'inv_reactivate','user_outsider')",
            [invitation.id],
          ),
        "pravi_identity_sync",
      );
      const [membership] = await query(
        "SELECT active,created_at,updated_at FROM asset_manager.department_memberships WHERE department_id=$1 AND clerk_id='user_outsider'",
        [deptA],
      );
      assert.equal(membership.active, true);
      assert.equal(
        new Date(membership.created_at).toISOString(),
        "2020-01-01T00:00:00.000Z",
      );
      assert.ok(
        new Date(membership.updated_at) > new Date(membership.created_at),
      );
    },
  );
  await check(
    "Indic partial text search preserves tenant isolation",
    async () => {
      const translations = ["सरकारी विद्यालय", "સરકારી શાળા", "அரசு பள்ளி"];
      for (const [index, name] of translations.entries()) {
        await rpc("user_officer_a", "create_asset", [
          deptA,
          { ...assetPayload(`LANG-${index}`), name },
          randomUUID(),
        ]);
        const term = name.split(" ")[1];
        const own = await rpc("user_officer_a", "search_assets", [
          deptA,
          term,
          25,
        ]);
        assert.equal(own.name, name);
        assert.equal(
          await rpc("user_officer_b", "search_assets", [deptA, term, 25]),
          undefined,
        );
      }
    },
  );
  await check(
    "asset closure remains possible after region deactivation",
    async () => {
      await rpc("user_admin", "edit_region", [
        region,
        "Synthetic District",
        false,
        "Region reorganised",
      ]);
      const closure = await rpc("user_officer_a", "request_asset_action", [
        assetA.id,
        assetA.version,
        "availability",
        "closed",
        "Urgent restriction",
        randomUUID(),
      ]);
      await denied("user_officer_a", "decide_asset_action", [
        closure.id,
        true,
        "Self",
      ]);
      await rpc("user_senior_a", "decide_asset_action", [
        closure.id,
        true,
        "Independent safety restriction",
      ]);
      assetA = (
        await query("SELECT * FROM asset_manager.assets WHERE id=$1", [
          assetA.id,
        ])
      )[0];
      assert.equal(assetA.availability, "closed");
    },
  );
  await check(
    "server-derived snapshots enforce scope, provenance and retry identity",
    async () => {
      const request = randomUUID();
      const snapshot = await rpc("user_officer_a", "create_report_snapshot", [
        authority,
        deptA,
        "inventory",
        request,
      ]);
      const replay = await rpc("user_officer_a", "create_report_snapshot", [
        authority,
        deptA,
        "inventory",
        request,
      ]);
      assert.equal(snapshot.id, replay.id);
      assert.equal(snapshot.created_by, "user_officer_a");
      assert.equal(snapshot.data.scope.department_id, deptA);
      assert.equal(snapshot.data.reporting_timezone, "Asia/Kolkata");
      const [expected] = await query(
        "SELECT count(*)::int n FROM asset_manager.assets WHERE authority_id=$1 AND department_id=$2 AND archived_at IS NULL",
        [authority, deptA],
      );
      assert.equal(snapshot.data.values.registered, expected.n);
      await denied("user_officer_b", "create_report_snapshot", [
        authority,
        deptA,
        "inventory",
        randomUUID(),
      ]);
      await denied("user_officer_a", "create_report_snapshot", [
        authority,
        null,
        "inventory",
        randomUUID(),
      ]);
      await denied("user_officer_a", "create_report_snapshot", [
        authority,
        deptA,
        "condition",
        request,
      ]);
      const central = await rpc("user_planner", "create_report_snapshot", [
        authority,
        null,
        "condition",
        randomUUID(),
      ]);
      assert.ok(Array.isArray(central.data.values));
      const visible = await asActor("user_planner", () =>
        query("SELECT id FROM asset_manager.report_snapshots WHERE id=$1", [
          central.id,
        ]),
      );
      assert.equal(visible.length, 1);
      const hidden = await asActor("user_officer_b", () =>
        query("SELECT id FROM asset_manager.report_snapshots WHERE id=$1", [
          snapshot.id,
        ]),
      );
      assert.equal(hidden.length, 0);
      for (const kind of ["restoration", "measure"]) {
        const result = await rpc("user_officer_a", "create_report_snapshot", [
          authority,
          deptA,
          kind,
          randomUUID(),
        ]);
        assert.ok(Array.isArray(result.data.values));
      }
    },
  );
  await check(
    "snapshot additive migration is repeatable and retains generator grants",
    async () => {
      const migration = await readFile(
        new URL(
          "../migrations/20260928_server_report_snapshots.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(migration);
      await db.exec(migration);
      const result = await rpc("user_officer_a", "create_report_snapshot", [
        authority,
        deptA,
        "inventory",
        randomUUID(),
      ]);
      assert.equal(result.created_by, "user_officer_a");
    },
  );
  await check(
    "webhook disable applies even to final administrator and cannot resurrect",
    async () => {
      await query(
        "INSERT INTO asset_manager.identities(clerk_id,email,email_verified,display_name,source_updated_at) VALUES('user_lastadmin','lastadmin@example.test',true,'Last admin','2026-01-01'),('user_lastadmin_two','lastadmin2@example.test',true,'Last admin two','2026-01-01')",
      );
      const lastAuthority = (
        await query(
          "SELECT asset_manager.bootstrap_authority('LAST','Recovery fixture','user_lastadmin','user_lastadmin_two') AS id",
        )
      )[0].id;
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.disable_identity('user_lastadmin_two','2026-02-01')",
          ),
        "pravi_identity_sync",
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.disable_identity('user_lastadmin','2026-02-01')",
          ),
        "pravi_identity_sync",
      );
      assert.notEqual(
        (
          await query(
            "SELECT disabled_at FROM asset_manager.identities WHERE clerk_id='user_lastadmin'",
          )
        )[0].disabled_at,
        null,
      );
      await assert.rejects(
        asActor("user_lastadmin", () =>
          query("SELECT * FROM asset_manager.authorities WHERE id=$1", [
            lastAuthority,
          ]),
        ),
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.sync_identity('user_lastadmin','lastadmin@example.test','Restored',true,'2026-03-01','en')",
          ),
        "pravi_identity_sync",
      );
      assert.notEqual(
        (
          await query(
            "SELECT disabled_at FROM asset_manager.identities WHERE clerk_id='user_lastadmin'",
          )
        )[0].disabled_at,
        null,
      );
    },
  );
  await check(
    "unverification of final administrator applies without policy rejection",
    async () => {
      await query(
        "INSERT INTO asset_manager.identities(clerk_id,email,email_verified,display_name,source_updated_at) VALUES('user_unverify','unverify@example.test',true,'Unverify','2026-01-01'),('user_unverify_two','unverify2@example.test',true,'Unverify two','2026-01-01')",
      );
      await query(
        "SELECT asset_manager.bootstrap_authority('UNVERIFY','Recovery fixture','user_unverify','user_unverify_two')",
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.sync_identity('user_unverify_two','unverify2@example.test','Unverify two',false,'2026-02-01','en')",
          ),
        "pravi_identity_sync",
      );
      await asActor(
        null,
        () =>
          query(
            "SELECT asset_manager.sync_identity('user_unverify','unverify@example.test','Unverify',false,'2026-02-01','en')",
          ),
        "pravi_identity_sync",
      );
      assert.equal(
        (
          await query(
            "SELECT email_verified FROM asset_manager.identities WHERE clerk_id='user_unverify'",
          )
        )[0].email_verified,
        false,
      );
    },
  );
  await check(
    "fresh install also supports pg_trgm already installed in public",
    async () => {
      const alternate = new PGlite({ extensions: { pg_trgm } });
      try {
        await alternate.exec("CREATE EXTENSION pg_trgm WITH SCHEMA public");
        await alternate.exec(schema);
        const extensions = (
          await alternate.query(
            "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm'",
          )
        ).rows;
        assert.equal(extensions[0].nspname, "public");
      } finally {
        await alternate.close();
      }
    },
  );
  console.log(`Local SQL validation passed: ${passed} groups.`);
} catch (error) {
  console.error("Schema validation failed:", error.message);
  if (error.detail) console.error(error.detail);
  if (error.where) console.error(error.where);
  if (error.position) {
    const position = Number(error.position);
    console.error(schema.slice(Math.max(0, position - 160), position + 160));
  }
  process.exitCode = 1;
} finally {
  await db.close();
}
