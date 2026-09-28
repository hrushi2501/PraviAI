import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assetManager } from "./schema-builder";

export const assetCurrentConditionView = assetManager
  .view("asset_current_condition", {
    assetId: uuid("asset_id"),
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    regionId: uuid("region_id"),
    templateCode: text("template_code"),
    templateVersion: integer("template_version"),
    registrationStatus: text("registration_status"),
    lifecycleStage: text("lifecycle_stage"),
    availability: text("availability"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    inspectionId: uuid("inspection_id"),
    observedOn: date("observed_on"),
    nextReviewOn: date("next_review_on"),
    lastAssessedCondition: text("last_assessed_condition"),
    assessmentFreshness: text("assessment_freshness"),
    currentCondition: text("current_condition"),
  })
  .as(sql`SELECT NULL`);

export const assetMapView = assetManager
  .view("asset_map_view", {
    assetId: uuid("asset_id"),
    assetCode: text("asset_code"),
    name: text("name"),
    departmentId: uuid("department_id"),
    departmentCode: text("department_code"),
    departmentName: text("department_name"),
    authorityId: uuid("authority_id"),
    regionId: uuid("region_id"),
    regionName: text("region_name"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    registrationStatus: text("registration_status"),
    lifecycleStage: text("lifecycle_stage"),
    availability: text("availability"),
    criticality: text("criticality"),
    currentCondition: text("current_condition"),
  })
  .as(sql`SELECT NULL`);

export const regionalMeasureTotalsView = assetManager
  .view("regional_measure_totals", {
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    regionId: uuid("region_id"),
    baseCategory: text("base_category"),
    measureUnit: text("measure_unit"),
    isChild: boolean("is_child"),
    measuredAssets: text("measured_assets"),
    recordedQuantity: numeric("recorded_quantity", { precision: 18, scale: 4 }),
  })
  .as(sql`SELECT NULL`);

export const assetAttentionView = assetManager
  .view("asset_attention", {
    assetId: uuid("asset_id"),
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    accountableClerkId: text("accountable_clerk_id"),
    reason: text("reason"),
    sourceId: text("source_id"),
    sourceAt: timestamp("source_at", { withTimezone: true }),
  })
  .as(sql`SELECT NULL`);

export const unlinkedComplaintsView = assetManager
  .view("unlinked_complaints", {
    complaintId: uuid("complaint_id"),
    departmentId: uuid("department_id"),
    externalReference: text("external_reference"),
    channel: text("channel"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    narrative: text("narrative"),
    reportedSeverity: text("reported_severity"),
    status: text("status"),
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  })
  .as(sql`SELECT NULL`);

export const regionalConditionSummaryView = assetManager
  .view("regional_condition_summary", {
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    regionId: uuid("region_id"),
    baseCategory: text("base_category"),
    registeredInventoryCount: integer("registered_inventory_count"),
    verifiedInventoryCount: integer("verified_inventory_count"),
    currentlyAssessedCount: integer("currently_assessed_count"),
    staleCount: integer("stale_count"),
    unknownOrStaleCount: integer("unknown_or_stale_count"),
    currentPoorCriticalCount: integer("current_poor_critical_count"),
    inspectionCoveragePercent: numeric("inspection_coverage_percent"),
    poorCriticalPercent: numeric("poor_critical_percent"),
  })
  .as(sql`SELECT NULL`);

export const regionalRestorationSummaryView = assetManager
  .view("regional_restoration_summary", {
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    regionId: uuid("region_id"),
    baseCategory: text("base_category"),
    status: text("status"),
    outstandingWorkCount: integer("outstanding_work_count"),
    unreviewedOrUnpricedCount: integer("unreviewed_or_unpriced_count"),
    reviewedEstimatePaise: numeric("reviewed_estimate_paise"),
  })
  .as(sql`SELECT NULL`);

export const conditionObservationPairsView = assetManager
  .view("condition_observation_pairs", {
    authorityId: uuid("authority_id"),
    departmentId: uuid("department_id"),
    regionId: uuid("region_id"),
    assetId: uuid("asset_id"),
    templateCode: text("template_code"),
    templateVersion: integer("template_version"),
    firstInspectionId: uuid("first_inspection_id"),
    firstObservedOn: date("first_observed_on"),
    firstCondition: text("first_condition"),
    latestInspectionId: uuid("latest_inspection_id"),
    latestObservedOn: date("latest_observed_on"),
    latestCondition: text("latest_condition"),
  })
  .as(sql`SELECT NULL`);
