"use server";

import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assets } from "@/db/schema/assets";
import { regions } from "@/db/schema/geography";
import { departments } from "@/db/schema/identities";
import { departmentTemplates } from "@/db/schema/templates";
import { withAuthenticatedAction } from "./action-client";
import { type RegisterAssetInput, registerAssetAction } from "./asset.actions";

export async function getAssetRegisterOptions() {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      const scopes = await tx
        .select({
          id: departments.id,
          name: departments.name,
          authorityId: departments.authorityId,
          canWrite: sql<boolean>`asset_manager.department_permission(${departments.id}, 'asset_write')`,
        })
        .from(departments)
        .where(eq(departments.active, true))
        .orderBy(asc(departments.name));
      return { departments: scopes };
    }),
  );
}

export async function getAssetRegistrationDefinitions(departmentId: string) {
  return withAuthenticatedAction(async ({ session }) => {
    const id = z.string().uuid().parse(departmentId);
    return session.withQuery(async (tx) => {
      const [department] = await tx
        .select({ authorityId: departments.authorityId })
        .from(departments)
        .where(eq(departments.id, id));
      if (!department)
        throw new Error("Department is unavailable or inaccessible");
      const templates = await tx
        .select({
          code: departmentTemplates.code,
          version: departmentTemplates.version,
          name: departmentTemplates.name,
          fields: departmentTemplates.fields,
        })
        .from(departmentTemplates)
        .where(
          and(
            eq(departmentTemplates.departmentId, id),
            eq(departmentTemplates.status, "published"),
          ),
        )
        .orderBy(
          asc(departmentTemplates.name),
          asc(departmentTemplates.version),
        );
      const places = await tx
        .select({ id: regions.id, name: regions.name, level: regions.level })
        .from(regions)
        .where(
          and(
            eq(regions.authorityId, department.authorityId),
            eq(regions.active, true),
          ),
        )
        .orderBy(asc(regions.name));
      return { templates, regions: places };
    });
  });
}

export async function listRegisteredAssets(input: {
  departmentId?: string;
  page: number;
  pageSize?: number;
  search: string;
  registration?: string;
  availability?: string;
  lifecycle?: string;
  sortBy?:
    | "code"
    | "name"
    | "department"
    | "template"
    | "registration"
    | "lifecycle"
    | "availability";
  sortOrder?: "asc" | "desc";
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const filter = z
      .object({
        departmentId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(100000),
        pageSize: z.number().int().min(5).max(200).default(20),
        search: z.string().max(240).default(""),
        registration: z.string().max(50).optional(),
        availability: z.string().max(50).optional(),
        lifecycle: z.string().max(50).optional(),
        sortBy: z
          .enum([
            "code",
            "name",
            "department",
            "template",
            "registration",
            "lifecycle",
            "availability",
          ])
          .default("code"),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
      })
      .parse(input);
    return session.withQuery(async (tx) => {
      const search = `%${filter.search.replace(/[\\%_]/g, "\\$&")}%`;
      const where = and(
        filter.departmentId
          ? eq(assets.departmentId, filter.departmentId)
          : undefined,
        isNull(assets.archivedAt),
        filter.search
          ? or(ilike(assets.name, search), ilike(assets.assetCode, search))
          : undefined,
        filter.registration
          ? eq(assets.registrationStatus, filter.registration)
          : undefined,
        filter.availability
          ? eq(assets.availability, filter.availability)
          : undefined,
        filter.lifecycle
          ? eq(assets.lifecycleStage, filter.lifecycle)
          : undefined,
      );

      const sortColumn =
        {
          code: assets.assetCode,
          name: assets.name,
          department: departments.name,
          template: assets.templateCode,
          registration: assets.registrationStatus,
          lifecycle: assets.lifecycleStage,
          availability: assets.availability,
        }[filter.sortBy] ?? assets.assetCode;

      const order =
        filter.sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

      const rows = await tx
        .select({
          id: assets.id,
          code: assets.assetCode,
          name: assets.name,
          template: assets.templateCode,
          department: departments.name,
          departmentId: assets.departmentId,
          registration: assets.registrationStatus,
          lifecycle: assets.lifecycleStage,
          availability: assets.availability,
        })
        .from(assets)
        .innerJoin(departments, eq(assets.departmentId, departments.id))
        .where(where)
        .orderBy(order, asc(assets.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize);

      const [total] = await tx
        .select({ value: count() })
        .from(assets)
        .where(where);
      return { rows, total: total?.value ?? 0, pageSize: filter.pageSize };
    });
  });
}

export async function saveRegisteredAsset(input: RegisterAssetInput) {
  const result = await registerAssetAction(input);
  if (!result.success) return result;
  return {
    success: true as const,
    data: {
      id: result.data.id,
      code: result.data.assetCode,
      registration: result.data.registrationStatus,
    },
  };
}
