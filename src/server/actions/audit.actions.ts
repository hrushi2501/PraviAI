"use server";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auditEvents } from "@/db/schema/audit";
import { authorities } from "@/db/schema/identities";
import { withAuthenticatedAction } from "./action-client";

export async function listAuthorityAuditAction(input: {
  authorityId?: string;
  page?: number;
  entityType?: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const filter = z
      .object({
        authorityId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(100000).default(1),
        entityType: z
          .enum([
            "assets",
            "inspections",
            "complaints",
            "work_orders",
            "work_estimates",
            "departments",
            "regions",
            "role_definitions",
            "department_memberships",
            "authority_memberships",
            "governance_requests",
            "department_templates",
            "approval_requests",
          ])
          .optional(),
      })
      .parse(input);
    return session.withQuery(async (tx) => {
      const scope = await tx
        .select({ id: authorities.id, name: authorities.name })
        .from(authorities)
        .where(sql`asset_manager.authority_admin(${authorities.id})`)
        .orderBy(authorities.name);
      if (!scope.length)
        return {
          authorities: scope,
          rows: [],
          total: 0,
          page: filter.page,
          denied: true,
        };
      if (
        filter.authorityId &&
        !scope.some((authority) => authority.id === filter.authorityId)
      )
        throw new Error(
          "Authority audit is unavailable in your current administrator scope",
        );
      const where = and(
        inArray(
          auditEvents.authorityId,
          filter.authorityId
            ? [filter.authorityId]
            : scope.map((authority) => authority.id),
        ),
        filter.entityType
          ? eq(auditEvents.entityType, filter.entityType)
          : undefined,
      );
      const rows = await tx
        .select({
          id: auditEvents.id,
          authorityId: auditEvents.authorityId,
          departmentId: auditEvents.departmentId,
          assetId: auditEvents.assetId,
          entityType: auditEvents.entityType,
          entityId: auditEvents.entityId,
          operation: auditEvents.operation,
          actorId: auditEvents.actorId,
          reason: auditEvents.reason,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
        .limit(25)
        .offset((filter.page - 1) * 25);
      const [total] = await tx
        .select({ value: count() })
        .from(auditEvents)
        .where(where);
      return {
        authorities: scope,
        rows,
        total: total?.value ?? 0,
        page: filter.page,
        denied: false,
      };
    });
  });
}
