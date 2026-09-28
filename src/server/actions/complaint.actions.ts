"use server";

import { z } from "zod";
import type {
  ComplaintChannel,
  ComplaintSeverity,
  ComplaintStatus,
} from "../domain/entities/complaint.entity";
import { withAuthenticatedAction } from "./action-client";
import { reasonSchema, uuidSchema, versionSchema } from "./action-schemas";

export async function getComplaintsAction(
  departmentId: string,
  filter?: { status?: ComplaintStatus; severity?: ComplaintSeverity },
) {
  return withAuthenticatedAction(async ({ repositories }) => {
    const options = z
      .object({
        departmentId: uuidSchema,
        filter: z
          .strictObject({
            status: z
              .enum([
                "open",
                "triaged",
                "investigating",
                "resolved",
                "reopened",
              ])
              .optional(),
            severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          })
          .optional(),
      })
      .parse({ departmentId, filter });
    const list = await repositories.complaints.findByDepartment(
      options.departmentId,
      options.filter,
    );
    return list.map((c) => c.toJSON());
  });
}

export async function getUnlinkedComplaintsAction(departmentId?: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    const list = await repositories.complaints.findUnlinked(
      uuidSchema.optional().parse(departmentId),
    );
    return list.map((c) => c.toJSON());
  });
}

export async function getComplaintsByAssetAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    const list = await repositories.complaints.findByAsset(
      uuidSchema.parse(assetId),
    );
    return list.map((c) => c.toJSON());
  });
}

export async function logComplaintAction(input: {
  departmentId: string;
  channel: ComplaintChannel;
  narrative: string;
  severity: ComplaintSeverity;
  assetId?: string;
  externalReference?: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    const created = await services.complaints.logComplaint(
      z
        .strictObject({
          departmentId: uuidSchema,
          channel: z.enum(["internal", "phone", "email", "other"]),
          narrative: z.string().trim().min(1).max(10000),
          severity: z.enum(["low", "medium", "high", "critical"]),
          assetId: uuidSchema.optional(),
          externalReference: z.string().max(2000).optional(),
        })
        .parse(input),
    );
    return created.toJSON();
  });
}

export async function linkComplaintToAssetAction(params: {
  complaintId: string;
  expectedVersion: number;
  assetId: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    const linked = await services.complaints.linkToAsset(
      z
        .strictObject({
          complaintId: uuidSchema,
          expectedVersion: versionSchema,
          assetId: uuidSchema,
          reason: reasonSchema,
        })
        .parse(params),
    );
    return linked.toJSON();
  });
}

export async function resolveComplaintAction(params: {
  complaintId: string;
  expectedVersion: number;
  resolution: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    const resolved = await services.complaints.resolveComplaint(
      z
        .strictObject({
          complaintId: uuidSchema,
          expectedVersion: versionSchema,
          resolution: reasonSchema,
        })
        .parse(params),
    );
    return resolved.toJSON();
  });
}
