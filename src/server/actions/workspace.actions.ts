"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assets } from "@/db/schema/assets";
import {
  authorities,
  authorityMemberships,
  departments,
  identities,
} from "@/db/schema/identities";
import { inspections, workOrders } from "@/db/schema/operations";
import { departmentTemplates } from "@/db/schema/templates";
import { withAuthenticatedAction } from "./action-client";

export async function getWorkspaceAction() {
  return withAuthenticatedAction(async ({ session }, actorId) =>
    session.withQuery(async (tx) => {
      const [identity] = await tx
        .select({
          name: identities.displayName,
          email: identities.email,
          locale: identities.locale,
        })
        .from(identities)
        .where(eq(identities.clerkId, actorId));
      const scope = await tx
        .select({
          id: departments.id,
          name: departments.name,
          code: departments.code,
          active: departments.active,
        })
        .from(departments)
        .orderBy(departments.name);
      const authorityAccess = await tx
        .select({
          id: authorities.id,
          name: authorities.name,
          role: authorityMemberships.role,
          isAdmin: sql<boolean>`asset_manager.authority_admin(${authorities.id})`,
        })
        .from(authorities)
        .innerJoin(
          authorityMemberships,
          eq(authorities.id, authorityMemberships.authorityId),
        )
        .where(
          and(
            eq(authorityMemberships.clerkId, actorId),
            eq(authorityMemberships.active, true),
            eq(authorities.active, true),
          ),
        );
      return {
        identity,
        departments: scope,
        authorities: authorityAccess,
        actorId,
      };
    }),
  );
}

export async function getOperationalQueueAction(input: {
  kind: "inspection" | "work";
  departmentId?: string;
  page?: number;
}) {
  return withAuthenticatedAction(async ({ session }, actorId) => {
    const options = z
      .object({
        kind: z.enum(["inspection", "work"]),
        departmentId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(100000).default(1),
      })
      .parse(input);
    return session.withQuery(async (tx) => {
      const table = options.kind === "inspection" ? inspections : workOrders;
      const permission =
        options.kind === "inspection" ? "inspection_approve" : "work_approve";
      const where = options.departmentId
        ? eq(table.departmentId, options.departmentId)
        : undefined;
      const countRows = await tx
        .select({ total: sql<number>`count(*)::integer` })
        .from(table)
        .where(where);
      const common = {
        id: table.id,
        version: table.version,
        assetId: table.assetId,
        assetName: assets.name,
        assetCode: assets.assetCode,
        department: departments.name,
        status: table.status,
        createdBy: table.createdBy,
        canEvidence: sql<boolean>`asset_manager.department_permission(${table.departmentId}, 'evidence_write')`,
        canReview: sql<boolean>`asset_manager.department_permission(${table.departmentId}, ${permission})`,
        canWrite: sql<boolean>`asset_manager.department_permission(${table.departmentId}, ${options.kind === "inspection" ? "inspection_write" : "work_write"})`,
      };
      const rows =
        options.kind === "inspection"
          ? await tx
              .select({
                ...common,
                date: inspections.observedOn,
                due: inspections.nextReviewOn,
                description: inspections.limitations,
                condition: inspections.condition,
                assignee: inspections.createdBy,
                canAccept: sql<boolean>`false`,
              })
              .from(inspections)
              .innerJoin(assets, eq(inspections.assetId, assets.id))
              .innerJoin(
                departments,
                eq(inspections.departmentId, departments.id),
              )
              .where(where)
              .orderBy(desc(inspections.observedOn), inspections.id)
              .limit(20)
              .offset((options.page - 1) * 20)
          : await tx
              .select({
                ...common,
                date: workOrders.targetOn,
                due: workOrders.targetOn,
                description: workOrders.description,
                condition: sql<string>`''`,
                assignee: workOrders.assignedTo,
                canAccept: sql<boolean>`asset_manager.department_permission(${workOrders.departmentId}, 'work_accept')`,
              })
              .from(workOrders)
              .innerJoin(assets, eq(workOrders.assetId, assets.id))
              .innerJoin(
                departments,
                eq(workOrders.departmentId, departments.id),
              )
              .where(where)
              .orderBy(desc(workOrders.createdAt), workOrders.id)
              .limit(20)
              .offset((options.page - 1) * 20);
      return {
        rows,
        total: countRows[0]?.total ?? 0,
        page: options.page,
        actorId,
      };
    });
  });
}

export async function getPublishedDefinitionsAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) =>
      tx
        .select({
          departmentId: departmentTemplates.departmentId,
          department: departments.name,
          code: departmentTemplates.code,
          name: departmentTemplates.name,
          version: departmentTemplates.version,
          components: departmentTemplates.components,
          fields: departmentTemplates.fields,
          stages: departmentTemplates.lifecycleStages,
          policy: departmentTemplates.policyReference,
        })
        .from(departmentTemplates)
        .innerJoin(
          departments,
          eq(departmentTemplates.departmentId, departments.id),
        )
        .where(
          and(
            eq(departmentTemplates.status, "published"),
            departmentId
              ? eq(
                  departmentTemplates.departmentId,
                  z.string().uuid().parse(departmentId),
                )
              : undefined,
          ),
        )
        .orderBy(
          departments.name,
          departmentTemplates.name,
          desc(departmentTemplates.version),
        )
        .limit(100),
    ),
  );
}
