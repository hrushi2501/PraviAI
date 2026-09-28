import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assets } from "@/db/schema/assets";
import { inspections, workOrders } from "@/db/schema/operations";
import { evidenceObjectKey, inspectEvidenceFile } from "@/lib/evidence-file";
import {
  evidenceStorageClient,
  privateEvidenceBucket,
} from "@/lib/evidence-storage";
import { reportError } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { DomainError, ForbiddenError } from "../db/error-mapper";
import type { DatabaseSession } from "../db/session";
import { StoredProcedureGateway } from "../db/stored-procedures";
import type { EvidenceRepository } from "../repositories/evidence.repository";

export class EvidenceService {
  constructor(
    private readonly session: DatabaseSession,
    public readonly evidenceRepo: EvidenceRepository,
  ) {}

  async getEvidence(id: string) {
    return this.evidenceRepo.findById(id);
  }

  /**
   * Protected delivery: records an audited evidence access event in the database,
   * then returns the provider and object key for signed URL generation.
   */
  async requestAuditedAccess(params: {
    evidenceId: string;
    purpose: string;
  }): Promise<{ id: string; provider: string; object_key: string }> {
    return this.session.withTransaction(async (_tx, procs) => {
      return procs.requestEvidenceAccess(params);
    });
  }

  async uploadEvidence(input: {
    assetId: string;
    inspectionId?: string;
    workOrderId?: string;
    requestId: string;
    caption?: string;
    classification: "internal" | "restricted";
    name: string;
    mime: string;
    bytes: Uint8Array<ArrayBuffer>;
  }) {
    const parent = z
      .strictObject({
        assetId: z.uuid(),
        inspectionId: z.uuid().optional(),
        workOrderId: z.uuid().optional(),
        requestId: z.uuid(),
        caption: z.string().max(2000).optional(),
        classification: z.enum(["internal", "restricted"]),
      })
      .refine(
        (value) => !(value.inspectionId && value.workOrderId),
        "Choose one evidence parent",
      )
      .parse({
        assetId: input.assetId,
        inspectionId: input.inspectionId,
        workOrderId: input.workOrderId,
        requestId: input.requestId,
        caption: input.caption,
        classification: input.classification,
      });
    const metadata = inspectEvidenceFile(input.name, input.mime, input.bytes);
    return this.session.withTransaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '8000ms'`);
      const lock =
        BigInt(
          `0x${createHash("sha256").update(`${this.session.actorId}:${parent.requestId}`).digest("hex").slice(0, 16)}`,
        ) & BigInt("0x7fffffffffffffff");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${lock.toString()}::bigint)`,
      );
      const [asset] = await tx
        .select({
          departmentId: assets.departmentId,
          archivedAt: assets.archivedAt,
          retiredAt: assets.retiredAt,
          registrationStatus: assets.registrationStatus,
          allowed: sql<boolean>`asset_manager.department_permission(${assets.departmentId}, 'evidence_write')`,
          workApprover: sql<boolean>`asset_manager.department_permission(${assets.departmentId}, 'work_approve')`,
        })
        .from(assets)
        .where(eq(assets.id, parent.assetId));
      if (!asset?.allowed || asset.archivedAt || asset.retiredAt)
        throw new ForbiddenError(
          "Evidence parent is unavailable or not writable.",
        );
      if (parent.inspectionId) {
        const [inspection] = await tx
          .select({
            createdBy: inspections.createdBy,
            status: inspections.status,
          })
          .from(inspections)
          .where(
            and(
              eq(inspections.id, parent.inspectionId),
              eq(inspections.assetId, parent.assetId),
              eq(inspections.departmentId, asset.departmentId),
            ),
          );
        if (
          !inspection ||
          inspection.createdBy !== this.session.actorId ||
          !["draft", "correction_required"].includes(inspection.status)
        )
          throw new ForbiddenError(
            "Only the assessor can upload draft inspection evidence.",
          );
      } else if (parent.workOrderId) {
        const [work] = await tx
          .select({
            assignedTo: workOrders.assignedTo,
            status: workOrders.status,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.id, parent.workOrderId),
              eq(workOrders.assetId, parent.assetId),
              eq(workOrders.departmentId, asset.departmentId),
            ),
          );
        if (
          !work ||
          ["completion_submitted", "accepted", "cancelled"].includes(
            work.status,
          ) ||
          (work.assignedTo !== this.session.actorId && !asset.workApprover)
        )
          throw new ForbiddenError("Work evidence is unavailable or frozen.");
      } else if (asset.registrationStatus === "submitted")
        throw new ForbiddenError("Submitted registration evidence is frozen.");
      const key = evidenceObjectKey(
        asset.departmentId,
        this.session.actorId,
        parent.assetId,
        parent.inspectionId ?? parent.workOrderId ?? parent.assetId,
        parent.requestId,
        metadata.sha256,
        metadata.suffix,
      );
      const client = evidenceStorageClient();
      const bucket = await privateEvidenceBucket(client);
      const uploaded = await bucket.storage.upload(
        key,
        new Blob([input.bytes], { type: metadata.mimeType }),
        { contentType: metadata.mimeType, upsert: false, cacheControl: "60" },
      );
      const alreadyExists =
        uploaded.error &&
        String(
          (uploaded.error as { statusCode?: string | number }).statusCode,
        ) === "409";
      if (uploaded.error && !alreadyExists)
        throw new DomainError(
          "Evidence storage upload failed. Retry using the same upload request.",
          "STORAGE_UNAVAILABLE",
          503,
        );
      if (alreadyExists) {
        const existing = await bucket.storage.download(key);
        if (
          existing.error ||
          !existing.data ||
          existing.data.size !== metadata.sizeBytes
        )
          throw new DomainError(
            "Existing upload does not match this file.",
            "UPLOAD_CONFLICT",
            409,
          );
        const actualHash = createHash("sha256")
          .update(new Uint8Array(await existing.data.arrayBuffer()))
          .digest("hex");
        if (actualHash !== metadata.sha256)
          throw new DomainError(
            "Existing upload does not match this file.",
            "UPLOAD_CONFLICT",
            409,
          );
      }
      const newlyUploaded = !uploaded.error;
      try {
        const attached = await tx.transaction(async (nested) =>
          new StoredProcedureGateway(nested).attachEvidence({
            assetId: parent.assetId,
            requestId: parent.requestId,
            data: {
              inspection_id: parent.inspectionId,
              work_order_id: parent.workOrderId,
              provider: "supabase_private",
              object_key: key,
              original_name: metadata.originalName,
              mime_type: metadata.mimeType,
              size_bytes: metadata.sizeBytes,
              sha256: metadata.sha256,
              caption: parent.caption,
              classification: parent.classification,
            },
          }),
        );
        return {
          id: attached.id,
          originalName: attached.originalName,
          classification: attached.classification,
        };
      } catch (error) {
        // The savepoint has rolled back, and the actor/request lock is still held.
        // Never remove a pre-existing object or a previous successfully linked retry.
        if (newlyUploaded) {
          const cleanup = await bucket.storage.remove([key]);
          if (cleanup.error)
            reportError(cleanup.error, "evidence_upload_cleanup_failed");
        }
        throw error;
      }
    });
  }

  async requestAuditedUrl(params: { evidenceId: string; purpose: string }) {
    const grant = await this.requestAuditedAccess(params);
    if (grant.provider !== "supabase_private")
      throw new DomainError(
        "Protected delivery for this evidence provider is not supported.",
        "UNSUPPORTED_STORAGE_PROVIDER",
        501,
      );
    if (
      !/^[a-f0-9-]{36}\//i.test(grant.object_key) ||
      grant.object_key.includes("..") ||
      grant.object_key.startsWith("/") ||
      grant.object_key.includes("\\")
    )
      throw new DomainError(
        "Evidence storage reference is invalid.",
        "INVALID_STORAGE_REFERENCE",
        503,
      );
    const bucket = await privateEvidenceBucket(evidenceStorageClient());
    const result = await bucket.storage.createSignedUrl(grant.object_key, 60, {
      download: true,
    });
    if (result.error || !result.data?.signedUrl)
      throw new DomainError(
        "Protected evidence delivery is unavailable.",
        "STORAGE_UNAVAILABLE",
        503,
      );
    if (!redis)
      throw new DomainError(
        "Protected download tickets require configured Redis.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    const ticket = crypto.randomUUID();
    const stored = await redis.set(
      `pravi:evidence-ticket:${ticket}`,
      {
        actorId: this.session.actorId,
        evidenceId: params.evidenceId,
        signedUrl: result.data.signedUrl,
      },
      { ex: 60 },
    );
    if (!stored)
      throw new DomainError(
        "Protected evidence delivery is unavailable.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    return {
      url: `/api/evidence/${params.evidenceId}/download?ticket=${ticket}`,
      expiresIn: 60,
    };
  }

  async removeEvidence(params: {
    evidenceId: string;
    reason: string;
  }): Promise<void> {
    await this.session.withTransaction(async (_tx, procs) => {
      await procs.removeEvidence({
        id: params.evidenceId,
        reason: params.reason,
      });
    });
  }
}
