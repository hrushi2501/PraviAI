import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Pravi asset_manager schema namespace.
 * All core tables, views, and stored procedures live inside this schema.
 */
export const assetManager = pgSchema("asset_manager");
