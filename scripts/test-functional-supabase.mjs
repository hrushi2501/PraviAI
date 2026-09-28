import postgres from "postgres";

// Legacy fixture exercise: never consume a live application/owner URL implicitly.
const directUrl = process.env.PRAVI_DISPOSABLE_OWNER_URL;
if (!directUrl || process.env.PRAVI_ALLOW_DISPOSABLE_TEST !== "1") {
  throw new Error(
    "This legacy fixture test requires explicit disposable local database opt-in; prefer test-postgres-integration.mjs.",
  );
}
const target = new URL(directUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !/^\/pravi_test_[a-z0-9_]+$/.test(target.pathname)
) {
  throw new Error(
    "Refusing fixture writes outside a local pravi_test_* database.",
  );
}
const sql = postgres(directUrl, { max: 1 });

async function runFunctionalTest() {
  console.log("=== RUNNING FUNCTIONAL RBAC & GEOSPATIAL TEST ===");

  await sql
    .begin(async (tx) => {
      // 1. Sync identities
      const clerkAdmin1 = "user_test_admin_nhai_001";
      const clerkAdmin2 = "user_test_admin_nhai_004";
      const clerkOfficer = "user_test_officer_nhai_002";
      const clerkOther = "user_test_officer_pwd_003";

      await tx`
      SELECT asset_manager.sync_identity(${clerkAdmin1}, 'nhai.admin1@gov.in', 'NHAI Admin 1', true, clock_timestamp(), 'en');
    `;
      await tx`
      SELECT asset_manager.sync_identity(${clerkAdmin2}, 'nhai.admin2@gov.in', 'NHAI Admin 2', true, clock_timestamp(), 'en');
    `;
      await tx`
      SELECT asset_manager.sync_identity(${clerkOfficer}, 'nhai.officer@gov.in', 'NHAI Officer', true, clock_timestamp(), 'en');
    `;
      await tx`
      SELECT asset_manager.sync_identity(${clerkOther}, 'pwd.officer@gov.in', 'PWD Officer', true, clock_timestamp(), 'en');
    `;
      console.log("✓ Identities synced");

      // 2. Setup Authorities & Departments
      const authRow = await tx`
      INSERT INTO asset_manager.authorities(code, name)
      VALUES ('NHAI', 'National Highways Authority of India')
      RETURNING id;
    `;
      const nhaiAuthorityId = authRow[0].id;

      const pwdAuthRow = await tx`
      INSERT INTO asset_manager.authorities(code, name)
      VALUES ('PWD_DL', 'Delhi PWD')
      RETURNING id;
    `;
      const pwdAuthorityId = pwdAuthRow[0].id;

      // Standard roles
      await tx`
      INSERT INTO asset_manager.role_definitions(authority_id, code, name, scope)
      VALUES (${nhaiAuthorityId}, 'admin', 'NHAI Administrator', 'authority'),
             (${nhaiAuthorityId}, 'officer', 'Field Officer', 'department');
    `;
      await tx`
      INSERT INTO asset_manager.role_definitions(authority_id, code, name, scope)
      VALUES (${pwdAuthorityId}, 'pwd_officer', 'PWD Field Officer', 'department');
    `;

      // Grant permissions
      await tx`
      INSERT INTO asset_manager.role_permissions(authority_id, role, permission)
      VALUES 
        (${nhaiAuthorityId}, 'admin', 'authority_admin'),
        (${nhaiAuthorityId}, 'admin', 'authority_read'),
        (${nhaiAuthorityId}, 'admin', 'read'),
        (${nhaiAuthorityId}, 'admin', 'asset_write'),
        (${nhaiAuthorityId}, 'officer', 'read'),
        (${nhaiAuthorityId}, 'officer', 'asset_write'),
        (${pwdAuthorityId}, 'pwd_officer', 'read'),
        (${pwdAuthorityId}, 'pwd_officer', 'asset_write');
    `;

      // Create Departments
      const deptRow = await tx`
      INSERT INTO asset_manager.departments(authority_id, code, name, created_by)
      VALUES (${nhaiAuthorityId}, 'NHAI_HQ', 'NHAI Headquarters', ${clerkAdmin1})
      RETURNING id;
    `;
      const nhaiDeptId = deptRow[0].id;

      const pwdDeptRow = await tx`
      INSERT INTO asset_manager.departments(authority_id, code, name, created_by)
      VALUES (${pwdAuthorityId}, 'PWD_NORTH', 'PWD North Zone', ${clerkOther})
      RETURNING id;
    `;
      const pwdDeptId = pwdDeptRow[0].id;

      // Memberships
      await tx`
      INSERT INTO asset_manager.authority_memberships(authority_id, clerk_id, role, granted_by)
      VALUES (${nhaiAuthorityId}, ${clerkAdmin1}, 'admin', ${clerkAdmin1}),
             (${nhaiAuthorityId}, ${clerkAdmin2}, 'admin', ${clerkAdmin1});
    `;
      await tx`
      INSERT INTO asset_manager.department_memberships(authority_id, department_id, clerk_id, role, granted_by)
      VALUES (${nhaiAuthorityId}, ${nhaiDeptId}, ${clerkOfficer}, 'officer', ${clerkAdmin1});
    `;
      await tx`
      INSERT INTO asset_manager.department_memberships(authority_id, department_id, clerk_id, role, granted_by)
      VALUES (${pwdAuthorityId}, ${pwdDeptId}, ${clerkOther}, 'pwd_officer', ${clerkOther});
    `;
      console.log(
        "✓ Authorities, Departments, Roles, and Memberships initialized",
      );

      // 3. Create a Region and Published Template
      const regionRow = await tx`
      INSERT INTO asset_manager.regions(authority_id, code, name, level)
      VALUES (${nhaiAuthorityId}, 'DL', 'Delhi', 'state')
      RETURNING id;
    `;
      const regionId = regionRow[0].id;

      await tx`
      INSERT INTO asset_manager.department_templates(
        department_id, code, version, base_category, status, name,
        fields, components, lifecycle_stages, transitions, policy_reference,
        created_by, submitted_by, approved_by, approved_at
      ) VALUES (
        ${nhaiDeptId}, 'bridge_v1', 1, 'bridge', 'published', 'National Bridge Standard',
        '[]'::jsonb, ARRAY['deck', 'piers', 'bearings'], ARRAY['commissioned', 'operational', 'maintenance'], '[]'::jsonb, 'IRC:SP:13',
        ${clerkAdmin1}, ${clerkOfficer}, ${clerkAdmin2}, now()
      );
    `;

      // 4. Create Asset using set_actor as NHAI Officer
      await tx`SELECT asset_manager.set_actor(${clerkOfficer});`;
      const curActor =
        await tx`SELECT asset_manager.actor(), asset_manager.actor_active();`;
      console.log(
        `✓ Actor context verified: clerk_id=${curActor[0].actor}, active=${curActor[0].actor_active}`,
      );

      const assetData = {
        region_id: regionId,
        template_code: "bridge_v1",
        template_version: 1,
        asset_code: "NH-44-BRIDGE-01",
        name: "Yamuna Expressway Flyover",
        latitude: 28.6139,
        longitude: 77.209,
        availability: "in_service",
        criticality: "high",
        criticality_reason: "Major interstate logistics corridor",
      };

      const requestId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

      const assetRow = await tx`
      SELECT * FROM asset_manager.create_asset(
        ${nhaiDeptId}::uuid,
        ${tx.json(assetData)},
        ${requestId}::uuid
      );
    `;
      const assetId = assetRow[0].id;
      console.log(
        `✓ Asset created: id=${assetId}, code=${assetRow[0].asset_code}`,
      );

      // 5. Test Geo-tagging update
      await tx`
      SELECT asset_manager.set_asset_geotag(
        ${assetId}::uuid,
        ${assetRow[0].version}::integer,
        19.0760,
        72.8777,
        'GPS survey recalibration to Western Ghats interchange'
      );
    `;
      const updatedAsset = await tx`
      SELECT latitude, longitude, version, registration_status FROM asset_manager.assets WHERE id = ${assetId};
    `;
      console.log(
        `✓ Geo-tag updated to (${updatedAsset[0].latitude}, ${updatedAsset[0].longitude}), version=${updatedAsset[0].version}, status=${updatedAsset[0].registration_status}`,
      );

      // 6. Test RBAC on asset_map_view as NHAI Officer
      const officerMapAssets =
        await tx`SELECT * FROM asset_manager.asset_map_view;`;
      console.log(
        `✓ NHAI Officer query on asset_map_view returned ${officerMapAssets.length} asset(s): "${officerMapAssets[0]?.name}"`,
      );
      if (
        officerMapAssets.length !== 1 ||
        officerMapAssets[0].asset_id !== assetId
      ) {
        throw new Error(
          "Map view RBAC failed: NHAI Officer should see their own asset",
        );
      }

      // 7. Test get_assets_in_bbox function
      // Bounding box around Mumbai (18-20 lat, 72-74 lng) should match
      const mumbaiBbox = await tx`
      SELECT * FROM asset_manager.get_assets_in_bbox(18.0, 72.0, 20.0, 74.0, ${nhaiDeptId}::uuid);
    `;
      console.log(
        `✓ BBox query around Mumbai returned ${mumbaiBbox.length} asset(s) (expected 1)`,
      );
      if (mumbaiBbox.length !== 1) {
        throw new Error(
          "BBox query around Mumbai failed to return geo-tagged asset",
        );
      }

      // Bounding box around Kolkata (22-23 lat, 88-89 lng) should NOT match
      const kolkataBbox = await tx`
      SELECT * FROM asset_manager.get_assets_in_bbox(22.0, 88.0, 23.0, 89.0, ${nhaiDeptId}::uuid);
    `;
      console.log(
        `✓ BBox query around Kolkata returned ${kolkataBbox.length} asset(s) (expected 0)`,
      );
      if (kolkataBbox.length !== 0) {
        throw new Error(
          "BBox query outside asset coords returned unexpected results",
        );
      }

      console.log("✓ All transactional checks passed!");
      // Rollback test data so database remains clean
      throw new Error("ROLLBACK_CLEANUP");
    })
    .catch((err) => {
      if (err.message === "ROLLBACK_CLEANUP") {
        console.log(
          "✓ Test transaction rolled back cleanly. Database remains clean.",
        );
      } else {
        throw err;
      }
    });

  // Now test RBAC cross-tenant isolation in a clean separate transaction
  console.log("\n=== TESTING CROSS-TENANT ISOLATION AS PWD OFFICER ===");
  await sql
    .begin(async (tx) => {
      // 1. Setup NHAI & PWD tenants
      const nhaiAuth = (
        await tx`INSERT INTO asset_manager.authorities(code, name) VALUES ('NHAI_ISO', 'NHAI') RETURNING id`
      )[0].id;
      const pwdAuth = (
        await tx`INSERT INTO asset_manager.authorities(code, name) VALUES ('PWD_ISO', 'PWD') RETURNING id`
      )[0].id;

      await tx`
      INSERT INTO asset_manager.role_definitions(authority_id, code, name, scope)
      VALUES (${nhaiAuth}, 'officer', 'NHAI Officer', 'department'),
             (${pwdAuth}, 'officer', 'PWD Officer', 'department');
    `;
      await tx`
      INSERT INTO asset_manager.role_permissions(authority_id, role, permission)
      VALUES (${nhaiAuth}, 'officer', 'read'), (${nhaiAuth}, 'officer', 'asset_write'),
             (${pwdAuth}, 'officer', 'read'), (${pwdAuth}, 'officer', 'asset_write');
    `;

      const clerkNhai = "user_iso_nhai_991";
      const clerkNhaiAdmin = "user_iso_nhai_admin_990";
      const clerkNhaiAdmin2 = "user_iso_nhai_admin_989";
      const clerkPwd = "user_iso_pwd_992";

      await tx`SELECT asset_manager.sync_identity(${clerkNhai}, 'nhai991@gov.in', 'NHAI Officer', true, clock_timestamp(), 'en')`;
      await tx`SELECT asset_manager.sync_identity(${clerkNhaiAdmin}, 'nhai990@gov.in', 'NHAI Admin', true, clock_timestamp(), 'en')`;
      await tx`SELECT asset_manager.sync_identity(${clerkNhaiAdmin2}, 'nhai989@gov.in', 'NHAI Admin 2', true, clock_timestamp(), 'en')`;
      await tx`SELECT asset_manager.sync_identity(${clerkPwd}, 'pwd992@gov.in', 'PWD Officer', true, clock_timestamp(), 'en')`;

      const nhaiDept = (
        await tx`INSERT INTO asset_manager.departments(authority_id, code, name, created_by) VALUES (${nhaiAuth}, 'D1', 'NHAI Dept', ${clerkNhaiAdmin}) RETURNING id`
      )[0].id;
      const pwdDept = (
        await tx`INSERT INTO asset_manager.departments(authority_id, code, name, created_by) VALUES (${pwdAuth}, 'D2', 'PWD Dept', ${clerkPwd}) RETURNING id`
      )[0].id;

      await tx`INSERT INTO asset_manager.department_memberships(authority_id, department_id, clerk_id, role, granted_by) VALUES (${nhaiAuth}, ${nhaiDept}, ${clerkNhai}, 'officer', ${clerkNhaiAdmin})`;
      await tx`INSERT INTO asset_manager.department_memberships(authority_id, department_id, clerk_id, role, granted_by) VALUES (${pwdAuth}, ${pwdDept}, ${clerkPwd}, 'officer', ${clerkPwd})`;

      const reg = (
        await tx`INSERT INTO asset_manager.regions(authority_id, code, name, level) VALUES (${nhaiAuth}, 'RG1', 'Region 1', 'state') RETURNING id`
      )[0].id;
      await tx`INSERT INTO asset_manager.department_templates(
               department_id, code, version, base_category, status, name,
               fields, components, lifecycle_stages, transitions, policy_reference,
               created_by, submitted_by, approved_by, approved_at
             ) VALUES (
               ${nhaiDept}, 'bridge_v1', 1, 'bridge', 'published', 'Bridge',
               '[]'::jsonb, ARRAY['deck'], ARRAY['operational'], '[]'::jsonb, 'REF1',
               ${clerkNhaiAdmin}, ${clerkNhai}, ${clerkNhaiAdmin2}, now()
             )`;

      // Create asset in NHAI department
      const secretAsset = (
        await tx`
      INSERT INTO asset_manager.assets(
        authority_id, department_id, region_id, template_code, template_version,
        asset_code, name, latitude, longitude, lifecycle_stage, created_by
      ) VALUES (
        ${nhaiAuth}, ${nhaiDept}, ${reg}, 'bridge_v1', 1,
        'SECRET-ASSET-01', 'Confidential Infrastructure', 19.0760, 72.8777,
        'operational', ${clerkNhai}
      ) RETURNING id;
    `
      )[0];

      // Switch to runtime role and actor to PWD officer
      await tx`SET LOCAL ROLE pravi_runtime;`;
      await tx`SELECT asset_manager.set_actor(${clerkPwd});`;

      // 1. PWD officer queries asset_map_view -> MUST be 0
      const pwdMapView = await tx`SELECT * FROM asset_manager.asset_map_view;`;
      console.log(
        `✓ PWD Officer queried asset_map_view: returned ${pwdMapView.length} rows (MUST be 0)`,
      );
      if (pwdMapView.length !== 0) {
        throw new Error(
          `LEAK DETECTED! PWD Officer saw ${pwdMapView.length} assets from NHAI!`,
        );
      }

      // 2. PWD officer queries get_assets_in_bbox for NHAI's department -> MUST be 0
      const pwdBbox =
        await tx`SELECT * FROM asset_manager.get_assets_in_bbox(18.0, 72.0, 20.0, 74.0, ${nhaiDept}::uuid);`;
      console.log(
        `✓ Cross-department get_assets_in_bbox returned ${pwdBbox.length} rows (MUST be 0)`,
      );
      if (pwdBbox.length !== 0) {
        throw new Error(
          `LEAK DETECTED! PWD Officer retrieved ${pwdBbox.length} assets from NHAI via BBox!`,
        );
      }

      // 3. PWD officer attempts to modify geo-tag of NHAI asset -> MUST be blocked
      let updateBlocked = false;
      try {
        await tx`
        SELECT asset_manager.set_asset_geotag(
          ${secretAsset.id}::uuid,
          1,
          20.0,
          73.0,
          'Unauthorized tamper'
        );
      `;
      } catch (e) {
        updateBlocked = true;
        console.log(
          `✓ Cross-department set_asset_geotag correctly blocked: "${e.message}"`,
        );
      }
      if (!updateBlocked) {
        throw new Error("Cross-department set_asset_geotag was NOT blocked!");
      }

      console.log("✓ Multi-tenant RBAC map security verified 100%!");
      throw new Error("ROLLBACK_CLEANUP");
    })
    .catch((err) => {
      if (err.message === "ROLLBACK_CLEANUP") {
        console.log("✓ Isolation test transaction rolled back cleanly.");
      } else {
        throw err;
      }
    });

  await sql.end();
  console.log("\n>>> ALL CHECKS & VERIFICATIONS COMPLETED SUCCESSFULLY! <<<");
}

runFunctionalTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
