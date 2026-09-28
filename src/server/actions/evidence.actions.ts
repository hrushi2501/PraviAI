"use server";

import { z } from "zod";
import { DomainError } from "../db/error-mapper";
import { withAuthenticatedAction } from "./action-client";
import { reasonSchema, uuidSchema } from "./action-schemas";

export async function getEvidenceByAssetAction(assetId: string) {
  return withAuthenticatedAction(async ({ repositories }) => {
    return repositories.evidence.findByAsset(uuidSchema.parse(assetId));
  });
}

export async function requestAuditedEvidenceUrlAction(params: {
  evidenceId: string;
  purpose: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    const input = z
      .strictObject({ evidenceId: uuidSchema, purpose: reasonSchema.max(500) })
      .parse(params);
    return services.evidence.requestAuditedUrl(input);
  });
}

export async function removeEvidenceAction(params: {
  evidenceId: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ services }) => {
    await services.evidence.removeEvidence(
      z
        .strictObject({ evidenceId: uuidSchema, reason: reasonSchema })
        .parse(params),
    );
    return { success: true };
  });
}

/** Legacy metadata-only callers cannot establish ownership or prove file upload. */
export async function attachEvidenceAction(_input: unknown) {
  return withAuthenticatedAction(async () => {
    throw new DomainError(
      "Upload the file through the authorized evidence uploader.",
      "UNVERIFIED_EVIDENCE",
      403,
    );
  });
}
