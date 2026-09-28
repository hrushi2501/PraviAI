"use server";

import { z } from "zod";
import { withAuthenticatedAction } from "./action-client";

const condition = z.enum(["good", "fair", "poor", "critical", "unknown"]);
const inspectionInput = z.object({
  assetId: z.string().uuid(),
  requestId: z.string().uuid(),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  condition,
  observations: z.record(
    z.string(),
    z.object({
      condition: z.enum(["good", "fair", "poor", "critical", "not_assessed"]),
      notes: z.string().max(10000).optional(),
    }),
  ),
  limitations: z.string().max(10000).optional(),
  nextReviewOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export async function createInspectionDraftAction(
  input: z.infer<typeof inspectionInput>,
) {
  return withAuthenticatedAction(async ({ session }) => {
    const data = inspectionInput.parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.createInspection({
        assetId: data.assetId,
        requestId: data.requestId,
        data: {
          observed_on: data.observedOn,
          condition: data.condition,
          observations: data.observations,
          limitations: data.limitations,
          next_review_on: data.nextReviewOn,
        },
      }),
    );
  });
}
const workInput = z.object({
  assetId: z.string().uuid(),
  requestId: z.string().uuid(),
  description: z.string().trim().min(1).max(10000),
  justification: z.string().trim().min(1).max(10000),
  inspectionId: z.string().uuid().optional(),
  complaintId: z.string().uuid().optional(),
  targetOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  assignToSelf: z.boolean(),
});
export async function proposeRestorationAction(
  input: z.infer<typeof workInput>,
) {
  return withAuthenticatedAction(async ({ session }, actorId) => {
    const data = workInput.parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.createWorkOrder({
        assetId: data.assetId,
        requestId: data.requestId,
        data: {
          description: data.description,
          justification: data.justification,
          inspection_id: data.inspectionId,
          complaint_id: data.complaintId,
          target_on: data.targetOn,
          assigned_to: data.assignToSelf ? actorId : undefined,
        },
      }),
    );
  });
}
