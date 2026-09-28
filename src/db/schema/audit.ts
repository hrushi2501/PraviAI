import {
  bigint,
  date,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { invitations } from "./governance";
import { authorities, departments, identities } from "./identities";
import { assetManager } from "./schema-builder";

export const auditEvents = assetManager.table("audit_events", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  authorityId: uuid("authority_id").references(() => authorities.id, {
    onDelete: "restrict",
  }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "restrict",
  }),
  assetId: uuid("asset_id").references(() => assets.id, {
    onDelete: "restrict",
  }),
  actorId: text("actor_id").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(), // 'INSERT' | 'UPDATE' | 'DELETE'
  beforeData: jsonb("before_data").$type<Record<string, unknown>>(),
  afterData: jsonb("after_data").$type<Record<string, unknown>>(),
  reason: text("reason"),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  transactionId: text("transaction_id").notNull(),
});

export const commandReceipts = assetManager.table(
  "command_receipts",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    operation: text("operation").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.requestId] })],
);

export const integrationOutbox = assetManager.table("integration_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  invitationId: uuid("invitation_id")
    .notNull()
    .references(() => invitations.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(), // 'clerk_invitation'
  status: text("status").default("pending").notNull(), // 'pending' | 'delivered' | 'cancelled' | 'failed'
  attempts: integer("attempts").default(0).notNull(),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export const reportSnapshots = assetManager.table("report_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "restrict",
  }),
  snapshotType: text("snapshot_type").notNull(), // 'condition' | 'restoration' | 'inventory' | 'measure'
  asOfDate: date("as_of_date").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AuditEventSelect = typeof auditEvents.$inferSelect;
export type CommandReceiptSelect = typeof commandReceipts.$inferSelect;
export type IntegrationOutboxSelect = typeof integrationOutbox.$inferSelect;
export type ReportSnapshotSelect = typeof reportSnapshots.$inferSelect;
