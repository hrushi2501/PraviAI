import { bigint, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { departments, identities } from "./identities";
import { complaints, inspections, workOrders } from "./operations";
import { assetManager } from "./schema-builder";

export const evidence = assetManager.table("evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id").references(() => assets.id, {
    onDelete: "restrict",
  }),
  inspectionId: uuid("inspection_id").references(() => inspections.id, {
    onDelete: "restrict",
  }),
  workOrderId: uuid("work_order_id").references(() => workOrders.id, {
    onDelete: "restrict",
  }),
  complaintId: uuid("complaint_id").references(() => complaints.id, {
    onDelete: "restrict",
  }),
  provider: text("provider").notNull(), // 'cloudinary' | 'supabase_private' | 'document_reference'
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: text("size_bytes").notNull(), // stored as bigint in SQL
  caption: text("caption"),
  sha256: text("sha256"),
  classification: text("classification").default("internal").notNull(), // 'synthetic_public' | 'internal' | 'restricted'
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removalReason: text("removal_reason"),
  createdBy: text("created_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const evidenceAccessEvents = assetManager.table(
  "evidence_access_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    departmentId: uuid("department_id").notNull(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const approvalEvidence = assetManager.table(
  "approval_evidence",
  {
    departmentId: uuid("department_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    approvalRequestId: uuid("approval_request_id").notNull(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    linkedBy: text("linked_by")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.approvalRequestId, table.evidenceId] }),
  ],
);

export type EvidenceSelect = typeof evidence.$inferSelect;
export type EvidenceInsert = typeof evidence.$inferInsert;
export type EvidenceAccessEventSelect =
  typeof evidenceAccessEvents.$inferSelect;
export type ApprovalEvidenceSelect = typeof approvalEvidence.$inferSelect;
