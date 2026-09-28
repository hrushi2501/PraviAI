import {
  date,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { regions } from "./geography";
import { authorities, departments, identities } from "./identities";
import { assetManager } from "./schema-builder";

export const assets = assetManager.table("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  assetCode: text("asset_code").notNull(),
  name: text("name").notNull(),
  templateCode: text("template_code").notNull(),
  templateVersion: integer("template_version").notNull(),
  attributes: jsonb("attributes")
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  regionId: uuid("region_id").references(() => regions.id, {
    onDelete: "restrict",
  }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  ownerReference: text("owner_reference"),
  custodianReference: text("custodian_reference"),
  sourceReference: text("source_reference"),
  commissioningDate: date("commissioning_date"),
  datePrecision: text("date_precision").default("unknown").notNull(),
  registrationStatus: text("registration_status").default("draft").notNull(),
  lifecycleStage: text("lifecycle_stage").notNull(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  availability: text("availability").default("unknown").notNull(),
  criticality: text("criticality").default("unknown").notNull(),
  criticalityReason: text("criticality_reason"),
  submittedBy: text("submitted_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  verifiedBy: text("verified_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  changeReason: text("change_reason"),
  measureValue: numeric("measure_value", { precision: 18, scale: 4 }),
  measureUnit: text("measure_unit"),
  responsibleOfficer: text("responsible_officer").references(
    () => identities.clerkId,
    { onDelete: "restrict" },
  ),
  parentAssetId: uuid("parent_asset_id"),
  createdBy: text("created_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  version: integer("version").default(1).notNull(),
});

export const assetMilestones = assetManager.table("asset_milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(), // 'planning' | 'construction' | 'commissioning' | 'inspection' | 'restoration' | 'restriction' | 'retirement' | 'correction' | 'other'
  occurredOn: date("occurred_on").notNull(),
  description: text("description").notNull(),
  sourceReference: text("source_reference").notNull(),
  evidenceId: uuid("evidence_id"),
  createdBy: text("created_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const duplicateCandidates = assetManager.table("duplicate_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  candidateAssetId: uuid("candidate_asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'confirmed' | 'dismissed'
  flaggedBy: text("flagged_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  reviewedBy: text("reviewed_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  decisionReason: text("decision_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AssetSelect = typeof assets.$inferSelect;
export type AssetInsert = typeof assets.$inferInsert;
export type AssetMilestoneSelect = typeof assetMilestones.$inferSelect;
export type AssetMilestoneInsert = typeof assetMilestones.$inferInsert;
export type DuplicateCandidateSelect = typeof duplicateCandidates.$inferSelect;
export type DuplicateCandidateInsert = typeof duplicateCandidates.$inferInsert;
