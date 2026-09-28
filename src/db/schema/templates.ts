import {
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { departments, identities } from "./identities";
import { assetManager } from "./schema-builder";

export const assetTemplates = assetManager.table(
  "asset_templates",
  {
    code: text("code").notNull(),
    version: integer("version").notNull(),
    labelKey: text("label_key").notNull(),
    fields: jsonb("fields").$type<Array<Record<string, unknown>>>().notNull(),
    components: text("components").array().notNull(),
    lifecycleStages: text("lifecycle_stages").array().notNull(),
    transitions: jsonb("transitions")
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    inspectableStages: text("inspectable_stages").array().notNull(),
    defaultReviewDays: integer("default_review_days"),
    policyReference: text("policy_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.code, table.version] })],
);

export const departmentTemplates = assetManager.table(
  "department_templates",
  {
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    baseCategory: text("base_category").notNull(), // 'road' | 'bridge' | 'building' | 'other'
    fields: jsonb("fields").$type<Array<Record<string, unknown>>>().notNull(),
    components: text("components").array().notNull(),
    lifecycleStages: text("lifecycle_stages").array().notNull(),
    transitions: jsonb("transitions")
      .$type<Array<Record<string, unknown>>>()
      .notNull(),
    inspectableStages: text("inspectable_stages").array().notNull(),
    policyReference: text("policy_reference").notNull(),
    status: text("status").default("draft").notNull(), // 'draft' | 'submitted' | 'published' | 'correction_required' | 'withdrawn'
    createdBy: text("created_by")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    submittedBy: text("submitted_by").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    approvedBy: text("approved_by").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revision: integer("revision").default(1).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.departmentId, table.code, table.version] }),
  ],
);

export type AssetTemplateSelect = typeof assetTemplates.$inferSelect;
export type AssetTemplateInsert = typeof assetTemplates.$inferInsert;
export type DepartmentTemplateSelect = typeof departmentTemplates.$inferSelect;
export type DepartmentTemplateInsert = typeof departmentTemplates.$inferInsert;
