import type { DatabaseSession } from "../db/session";
import type { InspectionEntity } from "../domain/entities/inspection.entity";
import type { InspectionRepository } from "../repositories/inspection.repository";

export interface CreateInspectionDTO {
  assetId: string;
  templateCode: string;
  templateVersion: number;
  observedOn: string;
  observations: Record<string, { condition: string; notes?: string }>;
  condition: string;
  limitations?: string;
  nextReviewOn?: string;
}

export class InspectionService {
  constructor(
    private readonly session: DatabaseSession,
    private readonly inspectionRepo: InspectionRepository,
  ) {}

  async submitInspection(
    input: CreateInspectionDTO,
  ): Promise<InspectionEntity> {
    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.createInspection({
        assetId: input.assetId,
        data: {
          observed_on: input.observedOn,
          observations: input.observations,
          condition: input.condition,
          limitations: input.limitations,
          next_review_on: input.nextReviewOn,
        },
        requestId: crypto.randomUUID(),
      });

      return this.inspectionRepo.toEntity(row);
    });
  }

  async transitionInspection(params: {
    id: string;
    expectedVersion: number;
    action: string;
    reason: string;
  }): Promise<InspectionEntity> {
    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.transitionInspection(params);
      return this.inspectionRepo.toEntity(row);
    });
  }
}
