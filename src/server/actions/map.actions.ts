"use server";

import {
  and,
  asc,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { assets } from "@/db/schema/assets";
import { regions } from "@/db/schema/geography";
import { departments } from "@/db/schema/identities";
import { assetCurrentConditionView } from "@/db/schema/views";
import { withAuthenticatedAction } from "./action-client";

const viewportSchema = z
  .strictObject({
    minLat: z.number().finite().min(-90).max(90),
    minLng: z.number().finite().min(-180).max(180),
    maxLat: z.number().finite().min(-90).max(90),
    maxLng: z.number().finite().min(-180).max(180),
  })
  .refine(
    (bounds) =>
      bounds.minLat <= bounds.maxLat && bounds.minLng <= bounds.maxLng,
    "Viewport minimums must not exceed maximums",
  );
const mapQuerySchema = z.strictObject({
  departmentId: z.string().uuid().optional(),
  regionId: z.string().uuid().optional(),
  condition: z.enum(["good", "fair", "poor", "critical", "unknown"]).optional(),
  registrationStatus: z
    .enum(["draft", "submitted", "verified", "correction_required"])
    .optional(),
  criticality: z
    .enum(["low", "medium", "high", "critical", "unknown"])
    .optional(),
  viewport: viewportSchema.optional(),
  mapping: z.enum(["mapped", "unmapped", "all"]).default("mapped"),
  page: z.number().int().min(1).max(1000000).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
});
export type PersistedMapInput = z.input<typeof mapQuerySchema>;

export async function getPersistedMapAction(input: PersistedMapInput = {}) {
  return withAuthenticatedAction(async ({ session }) => {
    const filters = mapQuerySchema.parse(input);
    return session.withQuery(async (tx) => {
      const conditions: SQL[] = [isNull(assets.archivedAt)];
      if (filters.departmentId)
        conditions.push(eq(assets.departmentId, filters.departmentId));
      if (filters.regionId)
        conditions.push(eq(assets.regionId, filters.regionId));
      if (filters.condition)
        conditions.push(
          eq(assetCurrentConditionView.currentCondition, filters.condition),
        );
      if (filters.registrationStatus)
        conditions.push(
          eq(assets.registrationStatus, filters.registrationStatus),
        );
      if (filters.criticality)
        conditions.push(eq(assets.criticality, filters.criticality));
      const mapped = and(
        isNotNull(assets.latitude),
        isNotNull(assets.longitude),
      );
      const unmapped = or(isNull(assets.latitude), isNull(assets.longitude));
      const rowsWhere = [...conditions];
      if (filters.mapping === "mapped") rowsWhere.push(mapped as SQL);
      if (filters.mapping === "unmapped") rowsWhere.push(unmapped as SQL);
      if (filters.viewport) {
        rowsWhere.push(
          gte(assets.latitude, String(filters.viewport.minLat)),
          lte(assets.latitude, String(filters.viewport.maxLat)),
          gte(assets.longitude, String(filters.viewport.minLng)),
          lte(assets.longitude, String(filters.viewport.maxLng)),
        );
      }
      const scopeQuery = tx
        .select({
          total: count(),
          mapped: sql<number>`count(*) FILTER (WHERE ${assets.latitude} IS NOT NULL AND ${assets.longitude} IS NOT NULL)::integer`,
          unmapped: sql<number>`count(*) FILTER (WHERE ${assets.latitude} IS NULL OR ${assets.longitude} IS NULL)::integer`,
          minLat: sql<
            string | null
          >`min(${assets.latitude}) FILTER (WHERE ${assets.latitude} IS NOT NULL AND ${assets.longitude} IS NOT NULL)`,
          minLng: sql<
            string | null
          >`min(${assets.longitude}) FILTER (WHERE ${assets.latitude} IS NOT NULL AND ${assets.longitude} IS NOT NULL)`,
          maxLat: sql<
            string | null
          >`max(${assets.latitude}) FILTER (WHERE ${assets.latitude} IS NOT NULL AND ${assets.longitude} IS NOT NULL)`,
          maxLng: sql<
            string | null
          >`max(${assets.longitude}) FILTER (WHERE ${assets.latitude} IS NOT NULL AND ${assets.longitude} IS NOT NULL)`,
        })
        .from(assets)
        .leftJoin(
          assetCurrentConditionView,
          eq(assetCurrentConditionView.assetId, assets.id),
        )
        .where(and(...conditions));
      const totalQuery = tx
        .select({ total: count() })
        .from(assets)
        .leftJoin(
          assetCurrentConditionView,
          eq(assetCurrentConditionView.assetId, assets.id),
        )
        .where(and(...rowsWhere));
      const dataQuery = tx
        .select({
          assetId: assets.id,
          assetCode: assets.assetCode,
          name: assets.name,
          departmentId: assets.departmentId,
          departmentName: departments.name,
          regionId: assets.regionId,
          regionName: regions.name,
          latitude: assets.latitude,
          longitude: assets.longitude,
          registrationStatus: assets.registrationStatus,
          lifecycleStage: assets.lifecycleStage,
          availability: assets.availability,
          criticality: assets.criticality,
          currentCondition: assetCurrentConditionView.currentCondition,
          assessmentFreshness: assetCurrentConditionView.assessmentFreshness,
          version: assets.version,
          canEditGeotag: sql<boolean>`asset_manager.department_permission(${assets.departmentId}, 'asset_write') AND ${assets.registrationStatus} <> 'submitted' AND (${assets.createdBy} = asset_manager.actor() OR asset_manager.department_permission(${assets.departmentId}, 'asset_verify')) AND (${assets.registrationStatus} <> 'verified' OR asset_manager.department_permission(${assets.departmentId}, 'asset_verify'))`,
        })
        .from(assets)
        .innerJoin(departments, eq(departments.id, assets.departmentId))
        .leftJoin(regions, eq(regions.id, assets.regionId))
        .leftJoin(
          assetCurrentConditionView,
          eq(assetCurrentConditionView.assetId, assets.id),
        )
        .where(and(...rowsWhere))
        .orderBy(asc(assets.assetCode), asc(assets.id))
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize);
      const [[scope], [totalResult], rows, departmentRows] = await Promise.all([
        scopeQuery,
        totalQuery,
        dataQuery,
        tx
          .select({
            id: departments.id,
            name: departments.name,
            code: departments.code,
          })
          .from(departments)
          .where(eq(departments.active, true))
          .orderBy(asc(departments.name)),
      ]);
      const total = Number(totalResult?.total ?? 0);
      return {
        items: rows.map((row) => ({
          ...row,
          latitude: row.latitude == null ? null : Number(row.latitude),
          longitude: row.longitude == null ? null : Number(row.longitude),
        })),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        pageCount: Math.ceil(total / filters.pageSize),
        scopeCounts: {
          total: Number(scope?.total ?? 0),
          mapped: Number(scope?.mapped ?? 0),
          unmapped: Number(scope?.unmapped ?? 0),
        },
        fitBounds:
          scope?.minLat != null &&
          scope.minLng != null &&
          scope.maxLat != null &&
          scope.maxLng != null
            ? {
                minLat: Number(scope.minLat),
                minLng: Number(scope.minLng),
                maxLat: Number(scope.maxLat),
                maxLng: Number(scope.maxLng),
              }
            : null,
        departments: departmentRows,
      };
    });
  });
}

export async function updateMapGeotagAction(input: {
  assetId: string;
  expectedVersion: number;
  latitude: number;
  longitude: number;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    const params = z
      .strictObject({
        assetId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        latitude: z.number().finite().min(6).max(38),
        longitude: z.number().finite().min(68).max(98),
        reason: z.string().trim().min(1).max(4000),
      })
      .parse(input);
    const asset = await services.assets.editAsset({
      assetId: params.assetId,
      expectedVersion: params.expectedVersion,
      patch: { latitude: params.latitude, longitude: params.longitude },
      reason: params.reason,
    });
    return asset.toJSON();
  });
}
