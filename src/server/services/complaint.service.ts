import { InvariantViolationError, NotFoundError } from "../db/error-mapper";
import type { DatabaseSession } from "../db/session";
import type {
  ComplaintChannel,
  ComplaintEntity,
  ComplaintSeverity,
  ComplaintStatus,
} from "../domain/entities/complaint.entity";
import type { ComplaintRepository } from "../repositories/complaint.repository";

export interface LogComplaintDTO {
  departmentId: string;
  channel: ComplaintChannel;
  narrative: string;
  severity: ComplaintSeverity;
  assetId?: string;
  externalReference?: string;
}

export class ComplaintService {
  constructor(
    private readonly session: DatabaseSession,
    private readonly complaintRepo: ComplaintRepository,
  ) {}

  async logComplaint(input: LogComplaintDTO): Promise<ComplaintEntity> {
    if (!input.narrative || input.narrative.trim().length === 0) {
      throw new InvariantViolationError("Complaint narrative cannot be blank");
    }

    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.createComplaint({
        departmentId: input.departmentId,
        data: {
          channel: input.channel,
          narrative: input.narrative.trim(),
          reported_severity: input.severity,
          asset_id: input.assetId ?? null,
          external_reference: input.externalReference ?? null,
          reported_at: new Date().toISOString(),
        },
        requestId: crypto.randomUUID(),
      });

      return this.complaintRepo.toEntity(row);
    });
  }

  async linkToAsset(params: {
    complaintId: string;
    expectedVersion: number;
    assetId: string;
    reason: string;
  }): Promise<ComplaintEntity> {
    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.linkComplaintAsset({
        id: params.complaintId,
        assetId: params.assetId,
        reason: params.reason,
      });

      return this.complaintRepo.toEntity(row);
    });
  }

  async transitionStatus(params: {
    complaintId: string;
    expectedVersion: number;
    targetStatus: ComplaintStatus;
    reason: string;
  }): Promise<ComplaintEntity> {
    const existing = await this.complaintRepo.findById(params.complaintId);
    if (!existing) {
      throw new NotFoundError(
        `Complaint with ID ${params.complaintId} not found`,
      );
    }

    existing.assertCanTransitionTo(params.targetStatus);

    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.transitionComplaint({
        id: params.complaintId,
        expectedVersion: params.expectedVersion,
        action: params.targetStatus,
        reason: params.reason,
      });

      return this.complaintRepo.toEntity(row);
    });
  }

  async resolveComplaint(params: {
    complaintId: string;
    expectedVersion: number;
    resolution: string;
  }): Promise<ComplaintEntity> {
    if (!params.resolution || params.resolution.trim().length === 0) {
      throw new InvariantViolationError(
        "A detailed resolution explanation is required to resolve a citizen complaint.",
      );
    }

    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.transitionComplaint({
        id: params.complaintId,
        expectedVersion: params.expectedVersion,
        action: "resolved",
        reason: params.resolution.trim(),
      });

      return this.complaintRepo.toEntity(row);
    });
  }
}
