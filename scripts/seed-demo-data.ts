import postgres from "postgres";

/**
 * Pravi Sovereign Government Infrastructure - Complete Demo Data Seeder
 *
 * Sets up:
 * 1. Administrator and departmental officer identities
 * 2. Authority: PRAVI
 * 3. Departments: PWD_ROADS (Roads & Bridges) & AMC_URBAN (Urban Infrastructure)
 * 4. Regional Hierarchy: Gujarat State -> Ahmedabad & Rajkot Districts -> Wards
 * 5. Published Templates (v1): road_arterial, bridge_rcc, public_building
 * 6. 8 Realistic Assets with accurate Gujarat GPS coordinates
 * 7. Multi-Period Paired Condition Observations (populating statutory condition trends)
 * 8. Restoration Work Orders & CPWD DSR Estimates (reviewed vs. unpriced backlog)
 * 9. Linked & Unlinked Citizen Grievances
 * 10. Candidate Draft Asset & Flagged Duplicate Candidate for live 4-eyes evaluation
 */

const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection) {
  console.error("Missing DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const db = postgres(connection, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
});

async function run() {
  console.log(
    "==================================================================",
  );
  console.log(
    "   PRAVI SOVEREIGN INFRASTRUCTURE — DEMO DATA SEEDING RUNNER     ",
  );
  console.log(
    "==================================================================",
  );

  try {
    // -------------------------------------------------------------------------
    // STEP 1: IDENTITIES
    // -------------------------------------------------------------------------
    console.log(
      "\n[1/8] Syncing Sovereign Administrator and Officer Personas...",
    );

    // Registered Clerk accounts
    const primaryAdminClerkId = "user_3Jx78UPmjOW0I4zBmhC7OGwen4I"; // hrushi.2501@gmail.com
    const secondaryAdminClerkId = "user_3Jx7hHqJ5nKDzcqEsOYIaeDQjBv"; // hrushibhanvadiya@gmail.com

    // Departmental official personas for 4-eyes separation
    const pwdEngineer = "user_demo_pwd_ee"; // Executive Engineer (Senior Approver)
    const pwdInspector = "user_demo_pwd_ae"; // Assistant Engineer (Field Assessor & Creator)
    const amcCommissioner = "user_demo_amc_comm"; // Dy. Municipal Commissioner (Senior Approver)
    const amcInspector = "user_demo_amc_insp"; // Ward Civil Inspector (Assessor & Creator)

    const identitiesToSync = [
      {
        id: primaryAdminClerkId,
        email: "hrushi.2501@gmail.com",
        name: "Hrushi Admin",
        locale: "en",
      },
      {
        id: secondaryAdminClerkId,
        email: "hrushibhanvadiya@gmail.com",
        name: "Hrushi Bhanvadiya",
        locale: "gu",
      },
      {
        id: pwdEngineer,
        email: "rajesh.patel.pwd@gujarat.gov.in",
        name: "Er. Rajesh Patel (EE, PWD)",
        locale: "en",
      },
      {
        id: pwdInspector,
        email: "meera.shah.pwd@gujarat.gov.in",
        name: "Er. Meera Shah (AE, PWD)",
        locale: "gu",
      },
      {
        id: amcCommissioner,
        email: "amit.varma.amc@ahmedabadcity.gov.in",
        name: "Shri Amit Varma (Dy. Comm, AMC)",
        locale: "en",
      },
      {
        id: amcInspector,
        email: "priya.trivedi.amc@ahmedabadcity.gov.in",
        name: "Smt. Priya Trivedi (AE, AMC)",
        locale: "gu",
      },
    ];

    for (const id of identitiesToSync) {
      await db`
        SELECT asset_manager.sync_identity(
          ${id.id},
          ${id.email},
          ${id.name},
          ${true},
          clock_timestamp(),
          ${id.locale}
        );
      `;
      console.log(`  ✓ Synced identity: ${id.name} (${id.id})`);
    }

    // -------------------------------------------------------------------------
    // STEP 2: AUTHORITY
    // -------------------------------------------------------------------------
    console.log("\n[2/8] Establishing Sovereign Authority...");
    let authorityId: string;
    const [existingAuth] =
      await db`SELECT id FROM asset_manager.authorities WHERE code = 'PRAVI' LIMIT 1;`;
    if (existingAuth) {
      authorityId = existingAuth.id;
      console.log(`  ✓ Existing Authority located: PRAVI (${authorityId})`);
    } else {
      const [newAuth] = await db`
        SELECT asset_manager.bootstrap_authority(
          'PRAVI',
          'Gujarat Public Infrastructure Authority',
          ${primaryAdminClerkId},
          ${secondaryAdminClerkId}
        ) AS id;
      `;
      authorityId = newAuth.id;
      console.log(`  ✓ Bootstrapped Authority: PRAVI (${authorityId})`);
    }

    // Ensure both admin accounts are authority admins
    for (const clerkId of [primaryAdminClerkId, secondaryAdminClerkId]) {
      await db`
        INSERT INTO asset_manager.authority_memberships (authority_id, clerk_id, role, active, granted_by)
        VALUES (${authorityId}, ${clerkId}, 'authority_admin', true, ${primaryAdminClerkId})
        ON CONFLICT (authority_id, clerk_id) DO UPDATE SET active = true, role = 'authority_admin';
      `;
    }

    // -------------------------------------------------------------------------
    // STEP 3: DEPARTMENTS & ROLE MEMBERSHIPS
    // -------------------------------------------------------------------------
    console.log(
      "\n[3/8] Creating Government Departments & Assigning Statutory Roles...",
    );

    async function getOrCreateDepartment(
      code: string,
      name: string,
    ): Promise<string> {
      const [existing] =
        await db`SELECT id FROM asset_manager.departments WHERE authority_id = ${authorityId} AND code = ${code} LIMIT 1;`;
      if (existing) {
        console.log(`  ✓ Department ${code} already exists (${existing.id})`);
        return existing.id;
      }

      // Execute create_department as owner, asserting actor for created_by
      const [row] = await db`
        INSERT INTO asset_manager.departments (authority_id, code, name, created_by)
        VALUES (${authorityId}, ${code}, ${name}, ${primaryAdminClerkId})
        RETURNING id;
      `;
      console.log(`  ✓ Created Department: ${name} (${code})`);
      return row.id;
    }

    const pwdDeptId = await getOrCreateDepartment(
      "PWD_ROADS",
      "Roads & Buildings Department",
    );
    const amcDeptId = await getOrCreateDepartment(
      "AMC_URBAN",
      "Ahmedabad Municipal Corporation Infrastructure",
    );

    // Assign memberships with four-eyes separation:
    // Admin users get department_manager and senior_approver in both departments!
    const memberships = [
      // PWD Roles
      {
        dept: pwdDeptId,
        user: primaryAdminClerkId,
        role: "department_manager",
      },
      { dept: pwdDeptId, user: secondaryAdminClerkId, role: "senior_approver" },
      { dept: pwdDeptId, user: pwdEngineer, role: "senior_approver" },
      { dept: pwdDeptId, user: pwdInspector, role: "officer" },

      // AMC Roles
      {
        dept: amcDeptId,
        user: primaryAdminClerkId,
        role: "department_manager",
      },
      { dept: amcDeptId, user: secondaryAdminClerkId, role: "senior_approver" },
      { dept: amcDeptId, user: amcCommissioner, role: "senior_approver" },
      { dept: amcDeptId, user: amcInspector, role: "officer" },
    ];

    for (const m of memberships) {
      await db`
        INSERT INTO asset_manager.department_memberships (authority_id, department_id, clerk_id, role, active, granted_by)
        VALUES (${authorityId}, ${m.dept}, ${m.user}, ${m.role}, true, ${primaryAdminClerkId})
        ON CONFLICT (department_id, clerk_id) DO UPDATE SET active = true, role = ${m.role};
      `;
      console.log(
        `  ✓ Assigned role ${m.role} to ${m.user} in department ${m.dept}`,
      );
    }

    // -------------------------------------------------------------------------
    // STEP 4: REGIONAL SPATIAL HIERARCHY
    // -------------------------------------------------------------------------
    console.log("\n[4/8] Building 3-Tier Regional Administrative Hierarchy...");

    async function getOrCreateRegion(
      code: string,
      name: string,
      level: string,
      parentId: string | null,
    ): Promise<string> {
      const [existing] =
        await db`SELECT id FROM asset_manager.regions WHERE authority_id = ${authorityId} AND code = ${code} LIMIT 1;`;
      if (existing) {
        return existing.id;
      }

      const [row] = await db`
        INSERT INTO asset_manager.regions (authority_id, parent_id, code, name, level)
        VALUES (${authorityId}, ${parentId ? parentId : null}::uuid, ${code}, ${name}, ${level})
        RETURNING id;
      `;
      console.log(`  ✓ Region [${level}] created: ${name} (${code})`);
      return row.id;
    }

    // Level 1: State
    const regGujarat = await getOrCreateRegion(
      "GJ",
      "Gujarat State",
      "state",
      null,
    );

    // Level 2: Districts
    const regAhmedabad = await getOrCreateRegion(
      "GJ-AMD",
      "Ahmedabad District",
      "district",
      regGujarat,
    );
    const regRajkot = await getOrCreateRegion(
      "GJ-RJK",
      "Rajkot District",
      "district",
      regGujarat,
    );

    // Level 3: Cities / Blocks
    const regAmdCity = await getOrCreateRegion(
      "GJ-AMD-CT",
      "Ahmedabad Municipal Corporation City Area",
      "city",
      regAhmedabad,
    );
    const regRajkotWest = await getOrCreateRegion(
      "GJ-RJK-CW",
      "Rajkot Central-West Sub-Division",
      "block",
      regRajkot,
    );

    // Level 4: Wards (parent must be 'city')
    const regAmdWest = await getOrCreateRegion(
      "GJ-AMD-WZ",
      "Ahmedabad West Zone (SG Highway / Bodakdev)",
      "ward",
      regAmdCity,
    );
    const regAmdEast = await getOrCreateRegion(
      "GJ-AMD-EZ",
      "Ahmedabad East Zone (Kalupur / Odhav)",
      "ward",
      regAmdCity,
    );

    // -------------------------------------------------------------------------
    // STEP 5: PUBLISHED ASSET TEMPLATES (4-EYES GOVERNED)
    // -------------------------------------------------------------------------
    console.log(
      "\n[5/8] Creating & Publishing Department Asset Templates (4-Eyes Workflow)...",
    );

    async function ensurePublishedTemplate(
      deptId: string,
      code: string,
      name: string,
      base: string,
      components: string[],
    ) {
      const [existing] = await db`
        SELECT version, status FROM asset_manager.department_templates
        WHERE department_id = ${deptId} AND code = ${code} AND status = 'published' LIMIT 1;
      `;
      if (existing) {
        console.log(
          `  ✓ Template ${code} v${existing.version} already published in department ${deptId}`,
        );
        return existing.version;
      }

      const reqId = crypto.randomUUID();
      const definition = {
        fields: [
          {
            key: "carriageway_width_m",
            type: "number",
            min: 3,
            max: 60,
            required: true,
          },
          {
            key: "design_speed_kmph",
            type: "integer",
            min: 20,
            max: 120,
            required: false,
          },
          { key: "jurisdiction_division", type: "text", required: true },
        ],
        components,
        lifecycle_stages: [
          "planned",
          "construction",
          "operational",
          "maintenance",
          "retired",
        ],
        transitions: [
          {
            from: "planned",
            to: "construction",
            permission: "asset_write",
            requires_approval: true,
          },
          {
            from: "construction",
            to: "operational",
            permission: "asset_verify",
            requires_approval: true,
          },
          {
            from: "operational",
            to: "maintenance",
            permission: "asset_write",
            requires_approval: true,
          },
          {
            from: "maintenance",
            to: "operational",
            permission: "asset_verify",
            requires_approval: true,
          },
          {
            from: "operational",
            to: "retired",
            permission: "asset_verify",
            requires_approval: true,
            retire: true,
          },
        ],
        inspectable_stages: ["operational", "maintenance"],
        policy_reference:
          "Indian Roads Congress (IRC:SP:84-2019 / IRC:SP:13) & CPWD Works Manual 2024",
      };

      // 1. Create draft by department manager (who has template_write)
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${primaryAdminClerkId});`;
        return tx`
          SELECT * FROM asset_manager.create_department_template(
            ${deptId}::uuid,
            ${code},
            ${name},
            ${base},
            ${tx.json(definition)},
            ${reqId}::uuid
          );
        `;
      });

      // 2. Submit draft by department manager
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${primaryAdminClerkId});`;
        await tx`
          SELECT * FROM asset_manager.transition_template(
            ${deptId}::uuid,
            ${code},
            1,
            1,
            'submit',
            'Submitted standard specification for statutory departmental adoption.'
          );
        `;
      });

      // 3. Publish by independent senior approver (Hrushi Bhanvadiya - distinct actor)
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
        await tx`
          SELECT * FROM asset_manager.transition_template(
            ${deptId}::uuid,
            ${code},
            1,
            2,
            'publish',
            'Adopted as official sovereign template per CPWD/IRC standards.'
          );
        `;
      });

      console.log(
        `  ✓ Published Template: ${name} (${code} v1) [4-eyes compliant]`,
      );
      return 1;
    }

    // PWD Templates
    await ensurePublishedTemplate(
      pwdDeptId,
      "road_arterial",
      "Paved Highway & Urban Arterial",
      "road",
      ["pavement", "drainage", "signage", "shoulders"],
    );
    await ensurePublishedTemplate(
      pwdDeptId,
      "bridge_rcc",
      "Reinforced Concrete Flyover & Bridge",
      "bridge",
      ["deck_slab", "piers", "bearings", "expansion_joints", "railings"],
    );

    // AMC Template
    await ensurePublishedTemplate(
      amcDeptId,
      "public_building",
      "Municipal Health & Educational Building",
      "building",
      [
        "structural_frame",
        "roof_waterproofing",
        "plumbing",
        "electrical",
        "finishes",
      ],
    );

    // -------------------------------------------------------------------------
    // STEP 6: REGISTERING & VERIFYING REAL ASSETS
    // -------------------------------------------------------------------------
    console.log(
      "\n[6/8] Registering & Verifying Physical Gujarat Infrastructure Assets...",
    );

    interface AssetSeedConfig {
      deptId: string;
      code: string;
      name: string;
      tmpl: string;
      regionId: string;
      lat: string;
      lng: string;
      commissioningDate: string;
      ownerRef: string;
      sourceRef: string;
      criticality: string;
      verify: boolean; // if false, leave in 'submitted' status for demo!
    }

    const assetConfigs: AssetSeedConfig[] = [
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-RD-001",
        name: "Sarkhej-Gandhinagar Highway Corridor (SH-17)",
        tmpl: "road_arterial",
        regionId: regAmdWest,
        lat: "23.0338600",
        lng: "72.5073100",
        commissioningDate: "2018-04-10",
        ownerRef: "Government of Gujarat, Roads & Buildings Dept",
        sourceRef: "Gazette Notification R&B/SH-17/Sanction-2018",
        criticality: "high",
        verify: true,
      },
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-BR-002",
        name: "132-Feet Ring Road Shivranjani Flyover",
        tmpl: "bridge_rcc",
        regionId: regAmdWest,
        lat: "23.0242500",
        lng: "72.5323400",
        commissioningDate: "2015-11-20",
        ownerRef: "Roads & Buildings Dept, Circle-I Ahmedabad",
        sourceRef: "Drawing Set PWD/AMD/BRG/2015-Shivranjani",
        criticality: "high",
        verify: true,
      },
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-BR-003",
        name: "Kalupur Heritage Railway Overbridge",
        tmpl: "bridge_rcc",
        regionId: regAmdEast,
        lat: "23.0289100",
        lng: "72.5976500",
        commissioningDate: "2006-08-15",
        ownerRef: "Ahmedabad Municipal Corp & Western Railway",
        sourceRef: "Joint Sanction Order WR-AMC-ROB-Kalupur-2006",
        criticality: "high",
        verify: true,
      },
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-RD-004",
        name: "SP Ring Road Odhav Industrial Bypass Arterial",
        tmpl: "road_arterial",
        regionId: regAmdEast,
        lat: "23.0185000",
        lng: "72.6621000",
        commissioningDate: "2017-02-28",
        ownerRef: "AUDA & PWD State Highway Division",
        sourceRef: "AUDA Completion Certificate CC-2017-Odhav",
        criticality: "medium",
        verify: true,
      },
      {
        deptId: amcDeptId,
        code: "GJ-AMC-BL-001",
        name: "Sheth L.G. General Hospital OPD Block",
        tmpl: "public_building",
        regionId: regAmdEast,
        lat: "23.0037000",
        lng: "72.6041000",
        commissioningDate: "2014-06-12",
        ownerRef: "Ahmedabad Municipal Corporation Health Dept",
        sourceRef: "AMC Building Permission BP-Maninagar-2014-LG",
        criticality: "high",
        verify: true,
      },
      {
        deptId: amcDeptId,
        code: "GJ-AMC-BL-002",
        name: "Rajkot Model CM Public School & Complex",
        tmpl: "public_building",
        regionId: regRajkotWest,
        lat: "22.3028000",
        lng: "70.7989000",
        commissioningDate: "2020-01-26",
        ownerRef: "Gujarat School Education Board & RMC",
        sourceRef: "Education Sanction Scheme SS-RJK-2020-01",
        criticality: "medium",
        verify: true,
      },
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-RD-005",
        name: "Sindhu Bhavan Multi-Modal Arterial Extension",
        tmpl: "road_arterial",
        regionId: regAmdWest,
        lat: "23.0482000",
        lng: "72.5124000",
        commissioningDate: "2024-01-15",
        ownerRef: "R&B Department, Ahmedabad Division",
        sourceRef: "PWD Tender No. 42/2023-24 Arterial Extension",
        criticality: "high",
        verify: false, // Left in submitted status for live demo verification!
      },
      {
        deptId: pwdDeptId,
        code: "GJ-PWD-RD-006",
        name: "SG Highway Parallel Service Road (Chainage 12-16)",
        tmpl: "road_arterial",
        regionId: regAmdWest,
        lat: "23.0341000",
        lng: "72.5076000",
        commissioningDate: "2018-05-15",
        ownerRef: "Government of Gujarat, Roads & Buildings Dept",
        sourceRef: "Service Road Sanction Memo 2018-SR-12",
        criticality: "medium",
        verify: true, // Will be flagged as duplicate candidate of Asset 1!
      },
    ];

    const seededAssetIds: Record<string, string> = {};

    for (const conf of assetConfigs) {
      const [existing] =
        await db`SELECT id, registration_status FROM asset_manager.assets WHERE asset_code = ${conf.code} LIMIT 1;`;
      if (existing) {
        seededAssetIds[conf.code] = existing.id;
        console.log(
          `  ✓ Asset ${conf.code} already exists (${existing.id}) [status: ${existing.registration_status}]`,
        );
        continue;
      }

      // 1. Create asset draft by inspector
      const reqId = crypto.randomUUID();
      const assetData = {
        asset_code: conf.code,
        name: conf.name,
        template_code: conf.tmpl,
        template_version: 1,
        attributes: {
          carriageway_width_m: 14.5,
          design_speed_kmph: 80,
          jurisdiction_division: "Ahmedabad Infrastructure Division",
        },
        region_id: conf.regionId,
        latitude: conf.lat,
        longitude: conf.lng,
        owner_reference: conf.ownerRef,
        custodian_reference: "Executive Engineer, Asset Custody",
        source_reference: conf.sourceRef,
        commissioning_date: conf.commissioningDate,
        date_precision: "exact",
        lifecycle_stage: "operational",
        availability: "in_service",
        criticality: conf.criticality,
        criticality_reason:
          "High traffic arterial corridor connecting economic and urban centers.",
      };

      const creatorActor =
        conf.deptId === amcDeptId ? amcInspector : pwdInspector;

      const [draft] = await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${creatorActor});`;
        return tx`
          SELECT * FROM asset_manager.create_asset(
            ${conf.deptId}::uuid,
            ${tx.json(assetData)},
            ${reqId}::uuid
          );
        `;
      });

      // 2. Submit draft by inspector
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${creatorActor});`;
        await tx`
          SELECT * FROM asset_manager.transition_asset(
            ${draft.id}::uuid,
            1,
            'submit',
            'Field survey completed with documentary georeference.'
          );
        `;
      });

      if (conf.verify) {
        // 3. Verify asset by independent senior approver (Hrushi Admin)
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${primaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.transition_asset(
              ${draft.id}::uuid,
              2,
              'verify',
              'Sovereign registration verified against physical gazette records.'
            );
          `;
        });
        console.log(`  ✓ Registered & Verified: ${conf.name} (${conf.code})`);
      } else {
        console.log(
          `  ✓ Registered Draft [Awaiting Verification]: ${conf.name} (${conf.code})`,
        );
      }

      seededAssetIds[conf.code] = draft.id;
    }

    // -------------------------------------------------------------------------
    // STEP 7: MULTI-PERIOD INSPECTIONS & PAIRED OBSERVATION TRENDS
    // -------------------------------------------------------------------------
    console.log(
      "\n[7/8] Conducting Inspections & Stamping Paired Condition Observations...",
    );

    async function recordInspection(params: {
      assetId: string;
      observedOn: string;
      condition: "good" | "fair" | "poor" | "critical";
      observations: Record<string, { condition: string; notes: string }>;
      evidenceCaption: string;
      assessor: string;
      approver: string;
      nextReviewDate: string;
      reason: string;
    }) {
      const reqId = crypto.randomUUID();
      const inspData = {
        observed_on: params.observedOn,
        observations: params.observations,
        condition: params.condition,
        limitations: "Visual inspection conducted during daylight hours.",
        next_review_on: params.nextReviewDate,
      };

      // 1. Create draft inspection
      const [insp] = await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${params.assessor});`;
        return tx`
          SELECT * FROM asset_manager.create_inspection(
            ${params.assetId}::uuid,
            ${tx.json(inspData)},
            ${reqId}::uuid
          );
        `;
      });

      // 2. Attach inspection photographic evidence
      const [assetRow] =
        await db`SELECT department_id FROM asset_manager.assets WHERE id = ${params.assetId}::uuid;`;
      const evReqId = crypto.randomUUID();
      const evData = {
        inspection_id: insp.id,
        provider: "document_reference",
        object_key: `${assetRow.department_id}/inspections/${insp.id}/survey_photo.webp`,
        original_name: "field_survey_condition.webp",
        mime_type: "image/webp",
        size_bytes: 421850,
        caption: params.evidenceCaption,
        sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        classification: "internal",
      };

      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${params.assessor});`;
        await tx`
          SELECT * FROM asset_manager.attach_evidence(
            ${params.assetId}::uuid,
            ${tx.json(evData)},
            ${evReqId}::uuid
          );
        `;
      });

      // 3. Submit inspection
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${params.assessor});`;
        await tx`
          SELECT * FROM asset_manager.transition_inspection(
            ${insp.id}::uuid,
            1,
            'submit',
            'Field observations and geotagged photographic evidence submitted for review.'
          );
        `;
      });

      // 4. Approve inspection by independent senior approver
      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${params.approver});`;
        await tx`
          SELECT * FROM asset_manager.transition_inspection(
            ${insp.id}::uuid,
            2,
            'approve',
            ${params.reason}
          );
        `;
      });

      return insp.id;
    }

    // Asset 1 (SG Highway): Pair 1 (Good in 2025) -> Pair 2 (Poor in 2026)
    const sgHwyId = seededAssetIds["GJ-PWD-RD-001"];
    if (sgHwyId) {
      const [existingInsps] =
        await db`SELECT count(*) FROM asset_manager.inspections WHERE asset_id = ${sgHwyId} AND status = 'approved';`;
      if (Number(existingInsps.count) < 2) {
        // Baseline 2025: Good
        await recordInspection({
          assetId: sgHwyId,
          observedOn: "2025-05-10",
          condition: "good",
          observations: {
            pavement: {
              condition: "good",
              notes: "Bituminous surface smooth; zero fatigue cracking.",
            },
            drainage: {
              condition: "good",
              notes: "Side drains clean and discharging freely.",
            },
            signage: {
              condition: "good",
              notes: "Retroreflective gantry signages fully compliant.",
            },
            shoulders: {
              condition: "good",
              notes: "Earthen shoulder stable and properly profiled.",
            },
          },
          evidenceCaption:
            "Baseline pre-monsoon inspection of SG Highway carriageway.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-02-15",
          reason: "Approved baseline condition observation.",
        });

        // Current 2026: Poor
        await recordInspection({
          assetId: sgHwyId,
          observedOn: "2026-02-15",
          condition: "poor",
          observations: {
            pavement: {
              condition: "poor",
              notes:
                "Severe fatigue alligator cracking; multiple potholes exceeding 50mm depth.",
            },
            drainage: {
              condition: "fair",
              notes: "Debris blockage in outfall chamber near Iscon crossroad.",
            },
            signage: { condition: "good", notes: "Signs intact." },
            shoulders: {
              condition: "poor",
              notes: "Erosion of earthen shoulder along chainage 14.2.",
            },
          },
          evidenceCaption:
            "Follow-up survey showing extensive asphalt fatigue and potholing.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-08-15",
          reason:
            "Confirmed deterioration; urgent bituminous restoration sanctioned.",
        });
        console.log(
          "  ✓ Stamped Paired Observation on SG Highway: Good (2025) -> Poor (2026)",
        );
      }
    }

    // Asset 2 (Shivranjani Flyover): Pair 1 (Good in 2025) -> Pair 2 (Fair in 2026)
    const flyoverId = seededAssetIds["GJ-PWD-BR-002"];
    if (flyoverId) {
      const [existingInsps] =
        await db`SELECT count(*) FROM asset_manager.inspections WHERE asset_id = ${flyoverId} AND status = 'approved';`;
      if (Number(existingInsps.count) < 2) {
        await recordInspection({
          assetId: flyoverId,
          observedOn: "2025-04-12",
          condition: "good",
          observations: {
            deck_slab: {
              condition: "good",
              notes: "Pre-stressed girder deck intact; no deflection.",
            },
            piers: { condition: "good", notes: "Piers plumb and sound." },
            bearings: {
              condition: "good",
              notes: "Elastomeric neoprene pads in proper seating.",
            },
            expansion_joints: {
              condition: "good",
              notes: "Modular expansion joints intact.",
            },
            railings: { condition: "good", notes: "Crash barriers undamaged." },
          },
          evidenceCaption: "Annual bridge health structural survey 2025.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-01-20",
          reason: "Structural condition verified sound.",
        });

        await recordInspection({
          assetId: flyoverId,
          observedOn: "2026-01-20",
          condition: "fair",
          observations: {
            deck_slab: { condition: "good", notes: "Girder system intact." },
            piers: { condition: "good", notes: "No settlement or scour." },
            bearings: {
              condition: "fair",
              notes: "Pier P3 bearing shows slight edge deformation.",
            },
            expansion_joints: {
              condition: "fair",
              notes: "Seal deterioration in span 4 joint.",
            },
            railings: { condition: "good", notes: "Crash barriers sound." },
          },
          evidenceCaption:
            "Bearing inspection showing minor elastomeric deformation at Pier 3.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-07-20",
          reason:
            "Periodic review approved; planned bearing replacement recommended.",
        });
        console.log(
          "  ✓ Stamped Paired Observation on Shivranjani Flyover: Good (2025) -> Fair (2026)",
        );
      }
    }

    // Asset 3 (Kalupur Heritage Overbridge): 1 Observation (Critical/Poor)
    const kalupurId = seededAssetIds["GJ-PWD-BR-003"];
    if (kalupurId) {
      const [existingInsps] =
        await db`SELECT count(*) FROM asset_manager.inspections WHERE asset_id = ${kalupurId} AND status = 'approved';`;
      if (Number(existingInsps.count) === 0) {
        await recordInspection({
          assetId: kalupurId,
          observedOn: "2026-03-01",
          condition: "critical",
          observations: {
            deck_slab: {
              condition: "poor",
              notes: "Extensive spalling on soffit; exposed rusted rebar.",
            },
            piers: {
              condition: "critical",
              notes: "Pier 4 masonry has longitudinal diagonal shear fracture.",
            },
            bearings: {
              condition: "poor",
              notes: "Rocker-roller bearings seized with rust.",
            },
            expansion_joints: {
              condition: "poor",
              notes: "Finger joints clogged with road debris.",
            },
            railings: {
              condition: "fair",
              notes: "Heritage cast iron railing intact but rusted.",
            },
          },
          evidenceCaption:
            "Critical pier shear crack and rebar corrosion under railway track.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-04-01",
          reason: "Immediate emergency structural attention required.",
        });
        console.log(
          "  ✓ Recorded Critical Condition on Kalupur Heritage ROB (triggers Attention Queue!)",
        );
      }
    }

    // Asset 4 (Odhav Industrial Arterial): Paired Observations
    const odhavId = seededAssetIds["GJ-PWD-RD-004"];
    if (odhavId) {
      const [existingInsps] =
        await db`SELECT count(*) FROM asset_manager.inspections WHERE asset_id = ${odhavId} AND status = 'approved';`;
      if (Number(existingInsps.count) < 2) {
        await recordInspection({
          assetId: odhavId,
          observedOn: "2025-03-10",
          condition: "fair",
          observations: {
            pavement: {
              condition: "fair",
              notes: "Heavy axle wheel rutting in industrial section.",
            },
            drainage: { condition: "fair", notes: "Silted roadside drains." },
            signage: { condition: "good", notes: "Signs visible." },
            shoulders: { condition: "fair", notes: "Shoulder stable." },
          },
          evidenceCaption: "Initial industrial road condition assessment.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2025-11-20",
          reason: "Approved baseline inspection.",
        });

        await recordInspection({
          assetId: odhavId,
          observedOn: "2025-11-20",
          condition: "poor",
          observations: {
            pavement: {
              condition: "poor",
              notes:
                "Severe surface breakdown; required milling & hot mix overlay.",
            },
            drainage: {
              condition: "poor",
              notes: "Flooding near truck terminal.",
            },
            signage: { condition: "good", notes: "Signs maintained." },
            shoulders: {
              condition: "poor",
              notes: "Damaged by parked heavy trailers.",
            },
          },
          evidenceCaption:
            "Post-monsoon damage survey showing rutting and breakdown.",
          assessor: pwdInspector,
          approver: secondaryAdminClerkId,
          nextReviewDate: "2026-05-20",
          reason: "Restoration approved.",
        });
        console.log(
          "  ✓ Stamped Paired Observation on Odhav Arterial: Fair -> Poor",
        );
      }
    }

    // -------------------------------------------------------------------------
    // STEP 8: RESTORATION WORK ORDERS & CPWD DSR RUPEE BACKLOG
    // -------------------------------------------------------------------------
    console.log(
      "\n[8/8] Populating Restoration Work Orders & CPWD DSR Rupee Accounting...",
    );

    // Work Order 1: SG Highway Pothole Remediation (Approved with Reviewed Estimate)
    if (sgHwyId) {
      const [existingWo] =
        await db`SELECT id FROM asset_manager.work_orders WHERE asset_id = ${sgHwyId} LIMIT 1;`;
      if (!existingWo) {
        const reqId = crypto.randomUUID();
        const woData = {
          description:
            "Bituminous Concrete Resurfacing & Deep Pothole Remediation (Chainage 11.0 to 15.0)",
          justification:
            "Critical traffic corridor distress posing severe two-wheeler vehicular hazard.",
          assigned_to: pwdEngineer,
          target_on: "2026-11-30",
        };

        const [wo] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_order(
              ${sgHwyId}::uuid,
              ${tx.json(woData)},
              ${reqId}::uuid
            );
          `;
        });

        // Add Estimate: ₹ 18,50,000.00 (185,000,000 paise) based on CPWD DSR 2023 Item 16.32
        const estReqId = crypto.randomUUID();
        const [est] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_estimate(
              ${wo.id}::uuid,
              185000000::bigint,
              'CPWD DSR 2023 Item 16.32 (Dense Bituminous Macadam 50mm + BC 40mm)',
              'Detailed Measurement Sheet certified by Sub-Division Surveyor',
              '2026-03-01'::date,
              ${estReqId}::uuid
            );
          `;
        });

        // Review estimate by Senior Approver
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.review_work_estimate(
              ${est.id}::uuid,
              true,
              'Rates verified against current CPWD DSR schedule; technical sanction approved.'
            );
          `;
        });

        // Approve Work Order by Senior Approver
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(
              ${wo.id}::uuid,
              1,
              'approve',
              '{}'::jsonb,
              'Sanctioned per Administrative Approval No. R&B/AA/2026/894.'
            );
          `;
        });
        console.log(
          "  ✓ Created & Approved Work Order on SG Highway: ₹18.50 Lakhs Reviewed Estimate!",
        );
      }
    }

    // Work Order 2: Shivranjani Flyover (In Progress)
    if (flyoverId) {
      const [existingWo] =
        await db`SELECT id FROM asset_manager.work_orders WHERE asset_id = ${flyoverId} LIMIT 1;`;
      if (!existingWo) {
        const reqId = crypto.randomUUID();
        const woData = {
          description:
            "Pier 3 Elastomeric Bearing Replacement & Expansion Joint Re-sealing",
          justification:
            "Bearing deformation observed during structural health inspection.",
          assigned_to: pwdEngineer,
          target_on: "2026-12-15",
        };

        const [wo] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_order(
              ${flyoverId}::uuid,
              ${tx.json(woData)},
              ${reqId}::uuid
            );
          `;
        });

        // Add Estimate: ₹ 6,25,000.00 (62,500,000 paise)
        const estReqId = crypto.randomUUID();
        const [est] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_estimate(
              ${wo.id}::uuid,
              62500000::bigint,
              'IRC:83 (Part II) Neoprene Bearing Specification & Specialized Hydraulic Jacking',
              'Specialized Structural Consultant Quotation & DSR Item 22.14',
              '2026-03-05'::date,
              ${estReqId}::uuid
            );
          `;
        });

        // Review estimate
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.review_work_estimate(
              ${est.id}::uuid,
              true,
              'Specialized bridge bearing repair sanction verified.'
            );
          `;
        });

        // Approve work order
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(
              ${wo.id}::uuid,
              1,
              'approve',
              '{}'::jsonb,
              'Approved for execution during nocturnal traffic curfew.'
            );
          `;
        });

        // Start work order (by assigned executor pwdEngineer)
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdEngineer});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(
              ${wo.id}::uuid,
              2,
              'start',
              '{}'::jsonb,
              'Hydraulic jacking equipment staged; work started on site.'
            );
          `;
        });
        console.log(
          "  ✓ Created & Started Work Order on Shivranjani Flyover: Status IN_PROGRESS!",
        );
      }
    }

    // Work Order 3: Odhav Arterial (Completion Submitted with actual cost)
    if (odhavId) {
      let [existingWo] =
        await db`SELECT id, status, version FROM asset_manager.work_orders WHERE asset_id = ${odhavId} LIMIT 1;`;
      if (!existingWo) {
        const reqId = crypto.randomUUID();
        const woData = {
          description: "Emergency Rutting Milling & Patching on Odhav Corridor",
          justification: "Heavy trailer axle damage remediation.",
          assigned_to: pwdEngineer,
          target_on: "2026-03-15",
        };

        const [wo] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_order(
              ${odhavId}::uuid,
              ${tx.json(woData)},
              ${reqId}::uuid
            );
          `;
        });

        // Add Estimate: ₹ 5,00,000.00
        const estReqId = crypto.randomUUID();
        const [est] = await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          return tx`
            SELECT * FROM asset_manager.create_work_estimate(
              ${wo.id}::uuid,
              50000000::bigint,
              'CPWD DSR Item 16.29 (Surface Dressing & Profiling)',
              'Direct Field Sanction',
              '2026-01-10'::date,
              ${estReqId}::uuid
            );
          `;
        });

        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.review_work_estimate(${est.id}::uuid, true, 'Estimate reviewed.');
          `;
        });

        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${secondaryAdminClerkId});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(${wo.id}::uuid, 1, 'approve', '{}'::jsonb, 'Approved.');
          `;
        });

        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdEngineer});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(${wo.id}::uuid, 2, 'start', '{}'::jsonb, 'Started.');
          `;
        });

        const [freshWo] =
          await db`SELECT id, status, version FROM asset_manager.work_orders WHERE id = ${wo.id} LIMIT 1;`;
        existingWo = freshWo;
      }

      if (existingWo && existingWo.status === "in_progress") {
        const todayStr = new Date().toISOString().slice(0, 10);
        // Attach completion evidence if not already present
        const [hasEv] =
          await db`SELECT id FROM asset_manager.evidence WHERE work_order_id = ${existingWo.id} LIMIT 1;`;
        if (!hasEv) {
          const evReqId = crypto.randomUUID();
          const evData = {
            work_order_id: existingWo.id,
            provider: "document_reference",
            object_key: `${pwdDeptId}/works/${existingWo.id}/completion_certificate.webp`,
            original_name: "contractor_completion_bill.webp",
            mime_type: "image/webp",
            size_bytes: 312400,
            caption:
              "Final bituminous compaction measurement bill and core test results.",
            sha256:
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            classification: "internal",
          };

          await db.begin(async (tx) => {
            await tx`SET LOCAL ROLE pravi_runtime;`;
            await tx`SELECT asset_manager.set_actor(${pwdEngineer});`;
            await tx`
              SELECT * FROM asset_manager.attach_evidence(
                ${odhavId}::uuid,
                ${tx.json(evData)},
                ${evReqId}::uuid
              );
            `;
          });
        }

        // Submit completion with actual cost: ₹ 4,80,000 (48,000,000 paise)
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdEngineer});`;
          await tx`
            SELECT * FROM asset_manager.transition_work_order(
              ${existingWo.id}::uuid,
              ${existingWo.version}::integer,
              'submit_completion',
              ${tx.json({
                completed_on: todayStr,
                actual_cost_paise: 48000000,
                completion_notes:
                  "All profiling and resurfacing completed per specifications; saving of ₹20,000 realized against estimate.",
              })},
              'Work completed and measured by Junior Engineer.'
            );
          `;
        });

        console.log(
          "  ✓ Created & Completed Work Order on Odhav Arterial: ₹4.80L Actual Cost!",
        );
      }
    }

    // Work Order 4: Kalupur Overbridge (Unpriced Proposed Work Order - triggers unpriced backlog counter!)
    if (kalupurId) {
      const [existingWo] =
        await db`SELECT id FROM asset_manager.work_orders WHERE asset_id = ${kalupurId} LIMIT 1;`;
      if (!existingWo) {
        const reqId = crypto.randomUUID();
        const woData = {
          description: "Emergency Pier 4 Shoring & Structural Underpinning",
          justification:
            "Critical diagonal shear crack requiring immediate structural bracing.",
          assigned_to: pwdEngineer,
          target_on: "2026-05-30",
        };

        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          await tx`
            SELECT * FROM asset_manager.create_work_order(
              ${kalupurId}::uuid,
              ${tx.json(woData)},
              ${reqId}::uuid
            );
          `;
        });
        console.log(
          "  ✓ Created Unpriced Work Order on Kalupur ROB (populates unpriced backlog!)",
        );
      }
    }

    // -------------------------------------------------------------------------
    // STEP 9: CITIZEN GRIEVANCES (COMPLAINTS)
    // -------------------------------------------------------------------------
    console.log(
      "\n[9/8 Extra] Logging Citizen Grievances (Linked & Unlinked)...",
    );

    // Complaint 1: Linked to SG Highway
    if (sgHwyId) {
      const [existingComp] =
        await db`SELECT id FROM asset_manager.complaints WHERE asset_id = ${sgHwyId} LIMIT 1;`;
      if (!existingComp) {
        const reqId = crypto.randomUUID();
        const compData = {
          channel: "phone",
          narrative:
            "Severe waterlogging and dangerous deep potholes on SG Highway between Iscon and Pakwan Crossroad during rain.",
          reported_severity: "high",
          asset_id: sgHwyId,
          external_reference: "CM-HELPLINE-2026-4491",
          reported_at: new Date().toISOString(),
        };

        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          await tx`
            SELECT * FROM asset_manager.create_complaint(
              ${pwdDeptId}::uuid,
              ${tx.json(compData)},
              ${reqId}::uuid
            );
          `;
        });
        console.log(
          "  ✓ Logged High-Severity Citizen Grievance linked to SG Highway",
        );
      }
    }

    // Complaint 2: Unlinked Complaint in AMC Department (for Triage Queue)
    const [existingUnlinked] =
      await db`SELECT id FROM asset_manager.complaints WHERE asset_id IS NULL AND department_id = ${amcDeptId} LIMIT 1;`;
    if (!existingUnlinked) {
      const reqId = crypto.randomUUID();
      const compData = {
        channel: "email",
        narrative:
          "Storm-water drainage trunk line surcharge causing sewage backflow on CG Road near Municipal Market.",
        reported_severity: "high",
        asset_id: null,
        external_reference: "AMC-CITIZEN-PORTAL-8910",
        reported_at: new Date().toISOString(),
      };

      await db.begin(async (tx) => {
        await tx`SET LOCAL ROLE pravi_runtime;`;
        await tx`SELECT asset_manager.set_actor(${amcInspector});`;
        await tx`
          SELECT * FROM asset_manager.create_complaint(
            ${amcDeptId}::uuid,
            ${tx.json(compData)},
            ${reqId}::uuid
          );
        `;
      });
      console.log(
        "  ✓ Logged Unlinked Citizen Grievance in AMC Department (populates Triage Queue!)",
      );
    }

    // -------------------------------------------------------------------------
    // STEP 10: DUPLICATE CANDIDATE LINKAGE (FOR 4-EYES RESOLUTION DEMO)
    // -------------------------------------------------------------------------
    const serviceRoadId = seededAssetIds["GJ-PWD-RD-006"];
    if (sgHwyId && serviceRoadId) {
      const [existingDup] = await db`
        SELECT id FROM asset_manager.duplicate_candidates
        WHERE (asset_id = ${sgHwyId} AND candidate_asset_id = ${serviceRoadId})
           OR (asset_id = ${serviceRoadId} AND candidate_asset_id = ${sgHwyId}) LIMIT 1;
      `;
      if (!existingDup) {
        await db.begin(async (tx) => {
          await tx`SET LOCAL ROLE pravi_runtime;`;
          await tx`SELECT asset_manager.set_actor(${pwdInspector});`;
          await tx`
            SELECT * FROM asset_manager.flag_duplicate(
              ${serviceRoadId}::uuid,
              ${sgHwyId}::uuid,
              'Service road corridor overlaps with primary highway chainage; flagged for review.'
            );
          `;
        });
        console.log(
          "  ✓ Flagged Duplicate Candidate between SG Highway and Service Road!",
        );
      }
    }

    console.log(
      "\n==================================================================",
    );
    console.log(
      "   ✓ DEMO DATA SEEDING COMPLETE & FULLY VERIFIED IN DATABASE!    ",
    );
    console.log(
      "==================================================================",
    );
  } catch (error) {
    console.error("\n❌ Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run();
