"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { departmentMemberships, identities } from "@/db/schema/identities";
import { workEstimates, workOrders } from "@/db/schema/operations";
import { withAuthenticatedAction } from "./action-client";
import {
  reasonSchema,
  recordCommandSchema,
  uuidSchema,
} from "./action-schemas";

const createWorkOrderSchema = z.strictObject({
  assetId: z.string().uuid("Valid asset UUID required"),
  description: z.string().min(1, "Description is required").max(10000),
  justification: z.string().min(1, "Justification is required").max(10000),
  inspectionId: z.string().uuid().optional(),
  complaintId: z.string().uuid().optional(),
  assignedTo: z.string().optional(),
  targetOn: z.iso.date().optional(),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export async function getWorkOrdersByAssetAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return (
      await repositories.workOrders.findByAsset(uuidSchema.parse(assetId))
    ).map((work) => work.toJSON());
  });
}

export async function getActiveWorkOrdersQueueAction(departmentId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return (
      await repositories.workOrders.findActiveQueue(
        uuidSchema.parse(departmentId),
      )
    ).map((work) => work.toJSON());
  });
}

export async function createWorkOrderAction(input: CreateWorkOrderInput) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = createWorkOrderSchema.parse(input);
    return session.withTransaction(async (_tx, procs) => {
      const row = await procs.createWorkOrder({
        assetId: validated.assetId,
        data: {
          description: validated.description,
          justification: validated.justification,
          inspection_id: validated.inspectionId,
          complaint_id: validated.complaintId,
          assigned_to: validated.assignedTo,
          target_on: validated.targetOn,
        },
        requestId: crypto.randomUUID(),
      });
      return row;
    });
  });
}

export async function transitionWorkOrderAction(params: {
  id: string;
  expectedVersion: number;
  action: string;
  data?: Record<string, unknown>;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    return session.withTransaction(async (_tx, procs) => {
      return procs.transitionWorkOrder(
        recordCommandSchema
          .extend({
            action: z.enum([
              "approve",
              "return",
              "cancel",
              "start",
              "submit_completion",
              "accept",
            ]),
            data: z.record(z.string(), z.unknown()).optional(),
          })
          .parse(params),
      );
    });
  });
}

export async function createWorkEstimateAction(params: {
  workOrderId: string;
  amountPaise: bigint | string;
  source: string;
  basis: string;
  date: string;
  requestId?: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        workOrderId: uuidSchema,
        amountPaise: z
          .union([z.bigint(), z.string().regex(/^[0-9]+$/)])
          .transform((value) => value.toString())
          .refine(
            (value) =>
              BigInt(value) > BigInt(0) &&
              BigInt(value) <= BigInt("9223372036854775807"),
            "Valid positive paise amount required",
          ),
        source: reasonSchema,
        basis: reasonSchema,
        date: z.iso.date(),
        requestId: uuidSchema.optional(),
      })
      .parse(params);
    return session.withTransaction(async (_tx, procs) => {
      return procs.createWorkEstimate({
        ...validated,
        requestId: validated.requestId ?? crypto.randomUUID(),
      });
    });
  });
}

export async function reviewWorkEstimateAction(params: {
  id: string;
  approve: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    return session.withTransaction(async (_tx, procs) => {
      return procs.reviewWorkEstimate(
        z
          .strictObject({
            id: uuidSchema,
            approve: z.boolean(),
            reason: reasonSchema,
          })
          .parse(params),
      );
    });
  });
}

export async function linkWorkVerificationAction(params: {
  workId: string;
  expectedVersion: number;
  inspectionId: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        workId: uuidSchema,
        expectedVersion: z.number().int().positive(),
        inspectionId: uuidSchema,
        reason: reasonSchema,
      })
      .parse(params);

    return session.withTransaction(async (_tx, procs) => {
      return procs.linkWorkVerification(validated);
    });
  });
}

export async function getAssetWorkEstimatesAction(assetId: string) {
  return withAuthenticatedAction(async ({ session }) => {
    const id = uuidSchema.parse(assetId);
    return session.withQuery((tx) =>
      tx
        .select({ estimate: workEstimates })
        .from(workEstimates)
        .innerJoin(workOrders, eq(workEstimates.workOrderId, workOrders.id))
        .where(eq(workOrders.assetId, id))
        .orderBy(desc(workEstimates.createdAt), desc(workEstimates.revision))
        .limit(100),
    );
  });
}

const workOrderPatchSchema = z
  .strictObject({
    description: z.string().trim().min(1).max(10000).optional(),
    justification: z.string().trim().min(1).max(10000).optional(),
    assigned_to: z
      .string()
      .regex(/^user_[A-Za-z0-9_]+$/)
      .nullable()
      .optional(),
    target_on: z.iso.date().nullable().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    "At least one correction is required",
  );
export type EditWorkOrderInput = {
  id: string;
  expectedVersion: number;
  patch: z.infer<typeof workOrderPatchSchema>;
  reason: string;
};
export async function editWorkOrderAction(input: EditWorkOrderInput) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = recordCommandSchema
      .extend({ patch: workOrderPatchSchema })
      .parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.editWorkOrder(params),
    );
  });
}
export async function getWorkOrderCorrectionAction(id: string) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = uuidSchema.parse(id);
    return session.withQuery(async (tx) => {
      const [record] = await tx
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, validated))
        .limit(1);
      if (!record) return null;
      const assignees = await tx
        .select({
          clerkId: identities.clerkId,
          displayName: identities.displayName,
        })
        .from(departmentMemberships)
        .innerJoin(
          identities,
          eq(identities.clerkId, departmentMemberships.clerkId),
        )
        .where(
          and(
            eq(departmentMemberships.departmentId, record.departmentId),
            eq(departmentMemberships.active, true),
            eq(identities.emailVerified, true),
            isNull(identities.disabledAt),
          ),
        )
        .orderBy(identities.displayName);
      return { record, assignees };
    });
  });
}
