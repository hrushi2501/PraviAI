import {
  date,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { departments, identities } from "./identities";
import { assetManager } from "./schema-builder";

export const inspections = assetManager.table("inspections", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  templateCode: text("template_code").notNull(),
  templateVersion: integer("template_version").notNull(),
  observedOn: date("observed_on").notNull(),
  observations: jsonb("observations")
    .$type<Record<string, { condition: string; notes?: string }>>()
    .default({})
    .notNull(),
  condition: text("condition").default("unknown").notNull(), // 'good' | 'fair' | 'poor' | 'critical' | 'unknown'
  limitations: text("limitations"),
  nextReviewOn: date("next_review_on"),
  status: text("status").default("draft").notNull(), // 'draft' | 'submitted' | 'approved' | 'correction_required'
  supersedesId: uuid("supersedes_id"),
  decisionReason: text("decision_reason"),
  createdBy: text("created_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  submittedBy: text("submitted_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  reviewedBy: text("reviewed_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  version: integer("version").default(1).notNull(),
});

export const inspectionComponents = assetManager.table(
  "inspection_components",
  {
    departmentId: uuid("department_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "restrict" }),
    componentKey: text("component_key").notNull(),
    condition: text("condition").notNull(), // 'good' | 'fair' | 'poor' | 'critical' | 'not_assessed'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.departmentId, table.inspectionId, table.componentKey],
    }),
  ],
);

export const complaints = assetManager.table("complaints", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id").references(() => assets.id, {
    onDelete: "restrict",
  }),
  externalReference: text("external_reference"),
  channel: text("channel").default("internal").notNull(), // 'internal' | 'phone' | 'email' | 'other'
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
  narrative: text("narrative").notNull(),
  reportedSeverity: text("reported_severity").default("unknown").notNull(), // 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  status: text("status").default("open").notNull(), // 'open' | 'triaged' | 'investigating' | 'resolved' | 'reopened'
  assignedTo: text("assigned_to").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  dueOn: date("due_on"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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

export const workOrders = assetManager.table("work_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  inspectionId: uuid("inspection_id"),
  complaintId: uuid("complaint_id"),
  description: text("description").notNull(),
  justification: text("justification").notNull(),
  status: text("status").default("proposed").notNull(), // 'proposed' | 'approved' | 'in_progress' | 'completion_submitted' | 'accepted' | 'correction_required' | 'cancelled'
  assignedTo: text("assigned_to").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  targetOn: date("target_on"),
  startedOn: date("started_on"),
  completedOn: date("completed_on"),
  actualCostPaise: text("actual_cost_paise"),
  completionNotes: text("completion_notes"),
  completionSubmittedBy: text("completion_submitted_by").references(
    () => identities.clerkId,
    { onDelete: "restrict" },
  ),
  approvedBy: text("approved_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  acceptedBy: text("accepted_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  verificationInspectionId: uuid("verification_inspection_id"),
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

export const workEstimates = assetManager.table(
  "work_estimates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    departmentId: uuid("department_id").notNull(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    amountPaise: text("amount_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    sourceReference: text("source_reference").notNull(),
    basis: text("basis").notNull(),
    estimatedOn: date("estimated_on").notNull(),
    status: text("status").default("proposed").notNull(), // 'proposed' | 'reviewed' | 'rejected'
    reviewedBy: text("reviewed_by").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.departmentId, table.workOrderId, table.revision],
    }),
  ],
);

export type InspectionSelect = typeof inspections.$inferSelect;
export type InspectionInsert = typeof inspections.$inferInsert;
export type ComplaintSelect = typeof complaints.$inferSelect;
export type ComplaintInsert = typeof complaints.$inferInsert;
export type WorkOrderSelect = typeof workOrders.$inferSelect;
export type WorkOrderInsert = typeof workOrders.$inferInsert;
export type WorkEstimateSelect = typeof workEstimates.$inferSelect;
export type WorkEstimateInsert = typeof workEstimates.$inferInsert;
