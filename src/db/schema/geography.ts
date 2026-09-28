import {
  boolean,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authorities } from "./identities";
import { assetManager } from "./schema-builder";

export const regions = assetManager.table("regions", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => authorities.id, { onDelete: "restrict" }),
  parentId: uuid("parent_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  localizedNames: jsonb("localized_names")
    .$type<Record<string, string>>()
    .default({})
    .notNull(),
  level: text("level").notNull(), // 'state' | 'district' | 'block' | 'city' | 'ward' | 'village'
  lgdCode: text("lgd_code"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const regionClosure = assetManager.table(
  "region_closure",
  {
    authorityId: uuid("authority_id")
      .notNull()
      .references(() => authorities.id, { onDelete: "cascade" }),
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.authorityId, table.ancestorId, table.descendantId],
    }),
  ],
);

export type RegionSelect = typeof regions.$inferSelect;
export type RegionInsert = typeof regions.$inferInsert;
export type RegionClosureSelect = typeof regionClosure.$inferSelect;
