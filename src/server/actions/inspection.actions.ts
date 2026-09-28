"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { inspections } from "@/db/schema/operations";
import { departmentTemplates } from "@/db/schema/templates";
import { withAuthenticatedAction } from "./action-client";
import { recordCommandSchema, uuidSchema } from "./action-schemas";

const submitInspectionSchema = z.strictObject({
  assetId: z.string().uuid("Valid asset UUID required"),
  templateCode: z.string().min(1, "Template code is required"),
  templateVersion: z.number().int().positive(),
  observedOn: z.iso.date(),
  observations: z.record(
    z.string(),
    z.object({
      condition: z.enum(["good", "fair", "poor", "critical", "not_assessed"]),
      notes: z.string().max(10000).optional(),
    }),
  ),
  condition: z.enum(["good", "fair", "poor", "critical", "unknown"]),
  limitations: z.string().max(10000).optional(),
  nextReviewOn: z.iso.date().optional(),
});

export type SubmitInspectionInput = z.infer<typeof submitInspectionSchema>;

export async function getInspectionsByAssetAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return (
      await repositories.inspections.findByAsset(uuidSchema.parse(assetId))
    ).map((inspection) => inspection.toJSON());
  });
}

export async function getLatestApprovedInspectionAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return (
      (
        await repositories.inspections.findLatestApproved(
          uuidSchema.parse(assetId),
        )
      )?.toJSON() ?? null
    );
  });
}

export async function submitInspectionAction(input: SubmitInspectionInput) {
  return withAuthenticatedAction(async ({ services }) => {
    const validated = submitInspectionSchema.parse(input);
    return (await services.inspections.submitInspection(validated)).toJSON();
  });
}

export async function transitionInspectionAction(params: {
  id: string;
  expectedVersion: number;
  action: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    return (
      await services.inspections.transitionInspection(
        recordCommandSchema
          .extend({ action: z.enum(["submit", "approve", "return"]) })
          .parse(params),
      )
    ).toJSON();
  });
}

const inspectionPatchSchema = z
  .strictObject({
    observed_on: z.iso.date().optional(),
    observations: z
      .record(
        z.string().min(1).max(80),
        z.strictObject({
          condition: z.enum([
            "good",
            "fair",
            "poor",
            "critical",
            "not_assessed",
          ]),
          notes: z.string().max(10000).optional(),
        }),
      )
      .optional(),
    condition: z
      .enum(["good", "fair", "poor", "critical", "unknown"])
      .optional(),
    limitations: z.string().max(10000).nullable().optional(),
    next_review_on: z.iso.date().nullable().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    "At least one correction is required",
  );
export type EditInspectionInput = {
  id: string;
  expectedVersion: number;
  patch: z.infer<typeof inspectionPatchSchema>;
  reason: string;
};
export async function editInspectionAction(input: EditInspectionInput) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = recordCommandSchema
      .extend({ patch: inspectionPatchSchema })
      .parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.editInspection(params),
    );
  });
}

export async function getInspectionCorrectionAction(id: string) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = uuidSchema.parse(id);
    return session.withQuery(async (tx) => {
      const [record] = await tx
        .select()
        .from(inspections)
        .where(eq(inspections.id, validated))
        .limit(1);
      if (!record) return null;
      const [definition] = await tx
        .select({ components: departmentTemplates.components })
        .from(departmentTemplates)
        .where(
          and(
            eq(departmentTemplates.departmentId, record.departmentId),
            eq(departmentTemplates.code, record.templateCode),
            eq(departmentTemplates.version, record.templateVersion),
          ),
        )
        .limit(1);
      return { record, components: definition?.components ?? [] };
    });
  });
}
