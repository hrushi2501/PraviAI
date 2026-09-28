import {
  boolean,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assetManager } from "./schema-builder";

export const identities = assetManager.table("identities", {
  clerkId: text("clerk_id").primaryKey(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  displayName: text("display_name").notNull(),
  locale: text("locale").default("en").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  sourceUpdatedAt: timestamp("source_updated_at", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const identityTombstones = assetManager.table("identity_tombstones", {
  clerkId: text("clerk_id").primaryKey(),
  sourceUpdatedAt: timestamp("source_updated_at", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authorities = assetManager.table("authorities", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const permissionCatalog = assetManager.table("permission_catalog", {
  code: text("code").primaryKey(),
  scope: text("scope").notNull(), // 'authority' | 'department'
});

export const roleDefinitions = assetManager.table(
  "role_definitions",
  {
    authorityId: uuid("authority_id")
      .notNull()
      .references(() => authorities.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    scope: text("scope").notNull(), // 'authority' | 'department'
    active: boolean("active").default(true).notNull(),
    version: integer("version").default(1).notNull(),
    maxEstimatePaise: text("max_estimate_paise"), // stored as bigint in SQL, string or bigint in JS
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.authorityId, table.code] })],
);

export const rolePermissions = assetManager.table(
  "role_permissions",
  {
    authorityId: uuid("authority_id").notNull(),
    role: text("role").notNull(),
    permission: text("permission")
      .notNull()
      .references(() => permissionCatalog.code, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.authorityId, table.role, table.permission] }),
  ],
);

export const authorityMemberships = assetManager.table(
  "authority_memberships",
  {
    authorityId: uuid("authority_id")
      .notNull()
      .references(() => authorities.id, { onDelete: "restrict" }),
    clerkId: text("clerk_id")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    role: text("role").notNull(),
    active: boolean("active").default(true).notNull(),
    grantedBy: text("granted_by").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    actingFor: text("acting_for").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.authorityId, table.clerkId] })],
);

export const departments = assetManager.table("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  localizedNames: jsonb("localized_names")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  clerkOrganizationId: text("clerk_organization_id").unique(),
  active: boolean("active").default(true).notNull(),
  deactivationReason: text("deactivation_reason"),
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

export const departmentMemberships = assetManager.table(
  "department_memberships",
  {
    authorityId: uuid("authority_id").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    clerkId: text("clerk_id")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    role: text("role").notNull(),
    active: boolean("active").default(true).notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => identities.clerkId, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    actingFor: text("acting_for").references(() => identities.clerkId, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.departmentId, table.clerkId] })],
);

export type IdentitySelect = typeof identities.$inferSelect;
export type IdentityInsert = typeof identities.$inferInsert;
export type AuthoritySelect = typeof authorities.$inferSelect;
export type AuthorityInsert = typeof authorities.$inferInsert;
export type DepartmentSelect = typeof departments.$inferSelect;
export type DepartmentInsert = typeof departments.$inferInsert;
export type DepartmentMembershipSelect =
  typeof departmentMemberships.$inferSelect;
export type DepartmentMembershipInsert =
  typeof departmentMemberships.$inferInsert;
