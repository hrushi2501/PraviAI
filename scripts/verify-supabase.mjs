import postgres from "postgres";

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const sql = postgres(directUrl);

async function verify() {
  console.log("=== SUPABASE ASSET MANAGER VERIFICATION ===");

  // 1. Schema version
  const version = await sql`SELECT * FROM asset_manager.schema_version;`;
  console.log("1. Schema Version:", version);

  // 2. Tables & RLS Status
  const tables = await sql`
    SELECT 
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      count(a.attname) as column_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'asset_manager' AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname;
  `;
  console.log(`\n2. Installed Tables (${tables.length} tables):`);
  console.table(
    tables.map((t) => ({
      table_name: t.table_name,
      columns: t.column_count,
      rls_enabled: t.rls_enabled,
      rls_forced: t.rls_forced,
    })),
  );

  // Check if any table is missing RLS (actor_contexts is UNLOGGED/temporary buffer, let's check)
  const unprotectTables = tables.filter(
    (t) =>
      !t.rls_enabled &&
      t.table_name !== "actor_contexts" &&
      t.table_name !== "schema_version",
  );
  if (unprotectTables.length > 0) {
    console.warn(
      "WARNING: Some tables do not have RLS enabled:",
      unprotectTables.map((t) => t.table_name),
    );
  } else {
    console.log(
      "✓ All persistent business tables have Row-Level Security ENABLED!",
    );
  }

  // 3. Views in asset_manager
  const views = await sql`
    SELECT 
      c.relname as view_name,
      c.relkind as kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'asset_manager' AND c.relkind IN ('v', 'm')
    ORDER BY c.relname;
  `;
  console.log(`\n3. Installed Views (${views.length} views):`);
  console.table(
    views.map((v) => ({
      view_name: v.view_name,
      kind: v.kind === "v" ? "view" : "materialized",
    })),
  );

  // 4. Test querying each view to ensure no broken column references or syntax issues
  console.log("\n4. Testing queries on each view:");
  for (const v of views) {
    try {
      const res = await sql.unsafe(
        `SELECT count(*) FROM asset_manager.${v.view_name}`,
      );
      console.log(
        `  ✓ View asset_manager.${v.view_name}: OK (count = ${res[0].count})`,
      );
    } catch (err) {
      console.error(
        `  ✗ View asset_manager.${v.view_name} FAILED:`,
        err.message,
      );
    }
  }

  // 5. Triggers
  const triggers = await sql`
    SELECT 
      event_object_table as table_name,
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'asset_manager'
    ORDER BY event_object_table, trigger_name;
  `;
  console.log(
    `\n5. Installed Triggers (${triggers.length} triggers across tables)`,
  );

  // 6. Functions in asset_manager
  const functions = await sql`
    SELECT 
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'asset_manager'
    ORDER BY p.proname;
  `;
  console.log(
    `\n6. Installed Functions (${functions.length} functions in asset_manager)`,
  );

  // 7. Check specific critical functions exist
  const criticalFunctions = [
    "set_actor",
    "actor",
    "actor_active",
    "create_asset",
    "set_asset_geotag",
    "get_assets_in_bbox",
    "link_complaint_asset",
    "anonymize_identity",
    "record_outbox_failure",
    "bulk_import_regions",
  ];
  console.log("\n7. Verifying critical functions exist:");
  for (const fn of criticalFunctions) {
    const found = functions.find((f) => f.function_name === fn);
    if (found) {
      console.log(
        `  ✓ ${fn}(${found.args}) [security_definer=${found.security_definer}]`,
      );
    } else {
      console.error(`  ✗ Missing critical function: ${fn}`);
    }
  }

  // 8. Test Geospatial and RBAC structures
  console.log("\n8. Verifying Geo-spatial column and indexes on assets:");
  const geoColumns = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'asset_manager' AND table_name = 'assets' AND column_name IN ('latitude', 'longitude');
  `;
  console.log("  Geo columns on assets:", geoColumns);

  const geoIndexes = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'asset_manager' AND tablename = 'assets' AND indexname = 'idx_assets_geo_coords';
  `;
  console.log(
    "  Geo index on assets:",
    geoIndexes.map((i) => i.indexname),
  );

  // 9. Roles and Grants
  console.log("\n9. Verifying Roles:");
  const roles = await sql`
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('pravi_runtime', 'pravi_identity_sync');
  `;
  console.table(roles);

  console.log("\n=== VERIFICATION COMPLETE ===");
  await sql.end();
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
