"use server";

import { desc, eq, isNull, sql } from "drizzle-orm";
import { assets } from "@/db/schema/assets";
import { reportSnapshots } from "@/db/schema/audit";
import {
  assetAttentionView,
  assetCurrentConditionView,
  assetMapView,
  conditionObservationPairsView,
  regionalConditionSummaryView,
  regionalMeasureTotalsView,
  regionalRestorationSummaryView,
} from "@/db/schema/views";
import { withAuthenticatedAction } from "./action-client";
import { uuidSchema } from "./action-schemas";
import { createServerReportSnapshotAction } from "./snapshot.actions";

export async function getAttentionQueueAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(assetAttentionView);
      if (departmentId) {
        query.where(eq(assetAttentionView.departmentId, departmentId));
      }
      return query.limit(50);
    }),
  );
}

export async function getRegionalTotalsAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(regionalMeasureTotalsView);
      if (departmentId) {
        query.where(eq(regionalMeasureTotalsView.departmentId, departmentId));
      }
      return query;
    }),
  );
}

export async function getAssetMapAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(assetMapView);
      if (departmentId) {
        query.where(eq(assetMapView.departmentId, departmentId));
      }
      return query.limit(500);
    }),
  );
}

export async function createReportSnapshotAction(
  params: Parameters<typeof createServerReportSnapshotAction>[0],
) {
  return createServerReportSnapshotAction(params);
}

export async function getReportSnapshotsAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx
        .select()
        .from(reportSnapshots)
        .orderBy(desc(reportSnapshots.createdAt))
        .limit(20);

      if (departmentId) {
        query.where(eq(reportSnapshots.departmentId, departmentId));
      }

      return query;
    }),
  );
}

export async function getDashboardSummaryAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx
        .select({
          totalRegistered: sql<number>`count(*)::integer`,
          verified: sql<number>`count(*) filter (where ${assets.registrationStatus} = 'verified')::integer`,
          currentAssessed: sql<number>`count(*) filter (where ${assets.registrationStatus} = 'verified' and ${assetCurrentConditionView.assessmentFreshness} = 'current' and ${assetCurrentConditionView.currentCondition} <> 'unknown')::integer`,
          goodOrFair: sql<number>`count(*) filter (where ${assets.registrationStatus} = 'verified' and ${assetCurrentConditionView.assessmentFreshness} = 'current' and ${assetCurrentConditionView.currentCondition} in ('good', 'fair'))::integer`,
          stale: sql<number>`count(*) filter (where ${assets.registrationStatus} = 'verified' and ${assetCurrentConditionView.assessmentFreshness} = 'stale')::integer`,
          neverAssessed: sql<number>`count(*) filter (where ${assets.registrationStatus} = 'verified' and ${assetCurrentConditionView.assessmentFreshness} = 'never_assessed')::integer`,
        })
        .from(assets)
        .leftJoin(
          assetCurrentConditionView,
          eq(assets.id, assetCurrentConditionView.assetId),
        );
      query.where(
        departmentId
          ? sql`${assets.archivedAt} is null and ${assets.departmentId} = ${departmentId}::uuid`
          : isNull(assets.archivedAt),
      );
      const [summary] = await query;
      return summary;
    }),
  );
}

export async function getRegionalConditionSummaryAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(regionalConditionSummaryView);
      if (departmentId) {
        query.where(
          eq(regionalConditionSummaryView.departmentId, departmentId),
        );
      }
      return query;
    }),
  );
}

export async function getRegionalRestorationSummaryAction(
  departmentId?: string,
) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(regionalRestorationSummaryView);
      if (departmentId) {
        query.where(
          eq(regionalRestorationSummaryView.departmentId, departmentId),
        );
      }
      return query;
    }),
  );
}

export async function getConditionObservationPairsAction(
  departmentId?: string,
) {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      departmentId = uuidSchema.optional().parse(departmentId);
      const query = tx.select().from(conditionObservationPairsView);
      if (departmentId) {
        query.where(
          eq(conditionObservationPairsView.departmentId, departmentId),
        );
      }
      return query.limit(20);
    }),
  );
}
