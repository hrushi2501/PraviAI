import {
  boolean,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { authorities, departments, identities } from "./identities";
import { assetManager } from "./schema-builder";

export const approvalRequests = assetManager.table("approval_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id").notNull(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  action: text("action").notNull(), // 'lifecycle' | 'availability' | 'archive' | 'unarchive'
  fromValue: text("from_value"),
  toValue: text("to_value"),
  assetVersion: integer("asset_version").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected' | 'cancelled'
  requestedBy: text("requested_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  decidedBy: text("decided_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  decidedRole: text("decided_role"),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const governanceRequests = assetManager.table("governance_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  action: text("action").notNull(), // 'department_create' | 'region_create' | 'role_create' | 'role_edit' | 'role_retire' | 'authority_member' | 'department_member'
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected' | 'cancelled'
  requestedBy: text("requested_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  decidedBy: text("decided_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  decidedRole: text("decided_role"),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const centralReadGrants = assetManager.table("central_read_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "restrict",
  }),
  clerkId: text("clerk_id")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  active: boolean("active").default(true).notNull(),
  grantedBy: text("granted_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const centralReadRequests = assetManager.table("central_read_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id"),
  clerkId: text("clerk_id")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  grantActive: boolean("grant_active").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  requestedBy: text("requested_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  decidedBy: text("decided_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const accessRequests = assetManager.table("access_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  clerkId: text("clerk_id")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'approved' | 'rejected'
  decisionReason: text("decision_reason"),
  decidedBy: text("decided_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invitations = assetManager.table("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  clerkInvitationId: text("clerk_invitation_id").unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").default("pending").notNull(), // 'pending' | 'sent' | 'accepted' | 'revoked' | 'expired'
  invitedBy: text("invited_by")
    .notNull()
    .references(() => identities.clerkId, { onDelete: "restrict" }),
  acceptedBy: text("accepted_by").references(() => identities.clerkId, {
    onDelete: "restrict",
  }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authorityRecoveryFlags = assetManager.table(
  "authority_recovery_flags",
  {
    authorityId: uuid("authority_id")
      .notNull()
      .references(() => authorities.id, { onDelete: "restrict" }),
    clerkId: text("clerk_id").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [primaryKey({ columns: [table.authorityId, table.clerkId] })],
);

export type ApprovalRequestSelect = typeof approvalRequests.$inferSelect;
export type ApprovalRequestInsert = typeof approvalRequests.$inferInsert;
export type GovernanceRequestSelect = typeof governanceRequests.$inferSelect;
export type GovernanceRequestInsert = typeof governanceRequests.$inferInsert;
export type InvitationSelect = typeof invitations.$inferSelect;
export type InvitationInsert = typeof invitations.$inferInsert;
