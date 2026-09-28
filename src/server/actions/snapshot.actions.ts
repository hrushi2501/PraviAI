"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { reportSnapshots } from "@/db/schema/audit";
import { authorities, departments } from "@/db/schema/identities";
import { withAuthenticatedAction } from "./action-client";

export async function getSnapshotWorkspaceAction() {
  return withAuthenticatedAction(async ({ session }) =>
    session.withQuery(async (tx) => {
      const scopes = await tx
        .select({
          id: departments.id,
          authorityId: departments.authorityId,
          name: departments.name,
        })
        .from(departments)
        .orderBy(departments.name);
      const owners = await tx
        .select({
          id: authorities.id,
          name: authorities.name,
          canReadWhole: sql<boolean>`asset_manager.authority_admin(${authorities.id}) OR (asset_manager.authority_read(${authorities.id}) AND EXISTS(SELECT 1 FROM asset_manager.central_read_grants g WHERE g.authority_id=${authorities.id} AND g.department_id IS NULL AND g.clerk_id=asset_manager.actor() AND g.active))`,
        })
        .from(authorities)
        .orderBy(authorities.name);
      return { departments: scopes, authorities: owners };
    }),
  );
}

export async function createServerReportSnapshotAction(input: {
  authorityId: string;
  departmentId?: string;
  snapshotType: "condition" | "restoration" | "inventory" | "measure";
  requestId: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const data = z
      .strictObject({
        authorityId: z.string().uuid(),
        departmentId: z.string().uuid().optional(),
        snapshotType: z.enum([
          "condition",
          "restoration",
          "inventory",
          "measure",
        ]),
        requestId: z.string().uuid(),
      })
      .parse(input);
    return session.withTransaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT id, snapshot_type AS "snapshotType", as_of_date::text AS "asOfDate" FROM asset_manager.create_report_snapshot(${data.authorityId}::uuid,${data.departmentId ?? null}::uuid,${data.snapshotType},${data.requestId}::uuid)`,
      );
      return rows[0] as unknown as {
        id: string;
        snapshotType: string;
        asOfDate: string;
      };
    });
  });
}

export async function listServerReportSnapshotsAction(input: {
  authorityId?: string;
  departmentId?: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const filter = z
      .strictObject({
        authorityId: z.string().uuid().optional(),
        departmentId: z.string().uuid().optional(),
      })
      .parse(input);
    return session.withQuery((tx) =>
      tx
        .select()
        .from(reportSnapshots)
        .where(
          and(
            filter.authorityId
              ? eq(reportSnapshots.authorityId, filter.authorityId)
              : undefined,
            filter.departmentId
              ? eq(reportSnapshots.departmentId, filter.departmentId)
              : undefined,
          ),
        )
        .orderBy(desc(reportSnapshots.createdAt))
        .limit(20),
    );
  });
}
