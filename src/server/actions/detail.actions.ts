"use server";

import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assets, duplicateCandidates } from "@/db/schema/assets";
import { auditEvents } from "@/db/schema/audit";
import { departmentTemplates } from "@/db/schema/templates";
import { withAuthenticatedAction } from "./action-client";

export async function getAssetContextAction(assetId: string) {
  return withAuthenticatedAction(async ({ session }, actorId) => {
    const id = z.string().uuid().parse(assetId);
    return session.withQuery(async (tx) => {
      const [asset] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, id))
        .limit(1);
      if (!asset) return null;
      const [permissions] = await tx
        .select({
          canEvidence: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'evidence_write')`,
          canInspect: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'inspection_write')`,
          canReviewWork: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'work_approve')`,
          canProposeWork: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'work_write')`,
          canWrite: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'asset_write')`,
          canVerify: sql<boolean>`asset_manager.department_permission(${asset.departmentId}::uuid, 'asset_verify')`,
        })
        .from(assets)
        .where(eq(assets.id, id))
        .limit(1);
      const history = await tx
        .select({
          id: auditEvents.id,
          actorId: auditEvents.actorId,
          entityType: auditEvents.entityType,
          operation: auditEvents.operation,
          reason: auditEvents.reason,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.assetId, id))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(50);
      const [definition] = await tx
        .select({ components: departmentTemplates.components })
        .from(departmentTemplates)
        .where(
          and(
            eq(departmentTemplates.departmentId, asset.departmentId),
            eq(departmentTemplates.code, asset.templateCode),
            eq(departmentTemplates.version, asset.templateVersion),
            eq(departmentTemplates.status, "published"),
          ),
        )
        .limit(1);
      const duplicates = await tx
        .select({
          id: duplicateCandidates.id,
          assetId: duplicateCandidates.assetId,
          candidateAssetId: duplicateCandidates.candidateAssetId,
          reason: duplicateCandidates.reason,
          status: duplicateCandidates.status,
          flaggedBy: duplicateCandidates.flaggedBy,
          decisionReason: duplicateCandidates.decisionReason,
        })
        .from(duplicateCandidates)
        .where(
          or(
            eq(duplicateCandidates.assetId, id),
            eq(duplicateCandidates.candidateAssetId, id),
          ),
        );
      return {
        asset,
        actorId,
        permissions,
        history,
        components: definition?.components ?? [],
        duplicateCandidates: duplicates,
      };
    });
  });
}
