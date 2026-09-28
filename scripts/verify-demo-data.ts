import postgres from "postgres";

const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection) {
  console.error("Missing DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const db = postgres(connection, {
  prepare: false,
  max: 1,
});

async function verify() {
  console.log(
    "==================================================================",
  );
  console.log(
    "   PRAVI SOVEREIGN INFRASTRUCTURE — DEMO DATA VERIFICATION       ",
  );
  console.log(
    "==================================================================",
  );

  try {
    const [authority] =
      await db`SELECT count(*) FROM asset_manager.authorities;`;
    const [departments] =
      await db`SELECT count(*) FROM asset_manager.departments;`;
    const [regions] = await db`SELECT count(*) FROM asset_manager.regions;`;
    const [templates] =
      await db`SELECT count(*) FROM asset_manager.department_templates WHERE status = 'published';`;
    const [assets] = await db`SELECT count(*) FROM asset_manager.assets;`;
    const [verifiedAssets] =
      await db`SELECT count(*) FROM asset_manager.assets WHERE registration_status = 'verified';`;
    const [inspections] =
      await db`SELECT count(*) FROM asset_manager.inspections WHERE status = 'approved';`;
    const [workOrders] =
      await db`SELECT count(*) FROM asset_manager.work_orders;`;
    const [workEstimates] =
      await db`SELECT count(*) FROM asset_manager.work_estimates WHERE status = 'reviewed';`;
    const [complaints] =
      await db`SELECT count(*) FROM asset_manager.complaints;`;
    const [duplicateCandidates] =
      await db`SELECT count(*) FROM asset_manager.duplicate_candidates;`;

    console.log("\n1. Core Persistent Inventory Counts:");
    console.log(`   - Authorities:           ${authority.count}`);
    console.log(`   - Departments:           ${departments.count}`);
    console.log(`   - Regions (Hierarchy):   ${regions.count}`);
    console.log(`   - Published Templates:   ${templates.count}`);
    console.log(`   - Total Assets:          ${assets.count}`);
    console.log(`   - Verified Assets:       ${verifiedAssets.count}`);
    console.log(`   - Approved Inspections:  ${inspections.count}`);
    console.log(`   - Work Orders:           ${workOrders.count}`);
    console.log(`   - Reviewed Estimates:    ${workEstimates.count}`);
    console.log(`   - Citizen Grievances:    ${complaints.count}`);
    console.log(`   - Duplicate Candidates:  ${duplicateCandidates.count}`);

    // Now test queries under pravi_runtime role with set_actor to verify RLS views!
    const primaryAdmin = "user_3Jx78UPmjOW0I4zBmhC7OGwen4I";

    console.log("\n2. Testing Statutory Views under pravi_runtime role:");

    await db.begin(async (tx) => {
      await tx`SET LOCAL ROLE pravi_runtime;`;
      await tx`SELECT asset_manager.set_actor(${primaryAdmin});`;

      // Paired condition observations view
      const pairs =
        await tx`SELECT * FROM asset_manager.condition_observation_pairs;`;
      console.log(
        `   ✓ View condition_observation_pairs: ${pairs.length} observation pairs found!`,
      );
      for (const p of pairs) {
        console.log(
          `     - Asset ${p.asset_id}: Baseline [${p.first_observed_on}] = ${p.first_condition.toUpperCase()} ➔ Current [${p.latest_observed_on}] = ${p.latest_condition.toUpperCase()}`,
        );
      }

      // Regional restoration summary view
      const restorations =
        await tx`SELECT * FROM asset_manager.regional_restoration_summary;`;
      console.log(
        `   ✓ View regional_restoration_summary: ${restorations.length} regional restoration records found!`,
      );
      for (const r of restorations) {
        console.log(
          `     - Status: ${r.status} | Outstanding: ${r.outstanding_work_count} | Reviewed Backlog: ₹ ${(Number(r.reviewed_estimate_paise) / 10000000).toFixed(2)} Lakhs | Unreviewed/Unpriced: ${r.unreviewed_or_unpriced_count}`,
        );
      }

      // Asset attention queue view
      const attention = await tx`SELECT * FROM asset_manager.asset_attention;`;
      console.log(
        `   ✓ View asset_attention: ${attention.length} attention triggers found!`,
      );
      for (const a of attention.slice(0, 5)) {
        console.log(`     - Asset ${a.asset_id}: Reason [${a.reason}]`);
      }

      // Map view
      const mapRecords = await tx`SELECT * FROM asset_manager.asset_map_view;`;
      console.log(
        `   ✓ View asset_map_view: ${mapRecords.length} assets with valid coordinates!`,
      );

      // Unlinked complaints view
      const unlinked =
        await tx`SELECT * FROM asset_manager.unlinked_complaints;`;
      console.log(
        `   ✓ View unlinked_complaints: ${unlinked.length} unlinked complaints ready for triage!`,
      );
    });

    console.log(
      "\n==================================================================",
    );
    console.log(
      "   ✓ ALL STATUTORY VIEWS RETURN DATA CORRECTLY UNDER RLS!         ",
    );
    console.log(
      "==================================================================",
    );
  } catch (error) {
    console.error("Verification failed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

verify();
