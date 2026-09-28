import { InvariantViolationError, NotFoundError } from "../db/error-mapper";
import type { DatabaseSession } from "../db/session";
import type { AssetEntity } from "../domain/entities/asset.entity";
import { GeoTag } from "../domain/value-objects/geo-tag";
import type { AssetRepository } from "../repositories/asset.repository";

export interface RegisterAssetDTO {
  departmentId: string;
  assetCode: string;
  name: string;
  templateCode: string;
  templateVersion: number;
  attributes?: Record<string, unknown>;
  regionId?: string;
  latitude?: number;
  longitude?: number;
  measureValue?: number;
  measureUnit?: string;
  responsibleOfficer?: string;
  sourceReference?: string;
  ownerReference?: string;
  custodianReference?: string;
  commissioningDate?: string;
  datePrecision?: "exact" | "year" | "approximate" | "unknown";
}

export class AssetService {
  constructor(
    private readonly session: DatabaseSession,
    private readonly assetRepo: AssetRepository,
  ) {}

  async registerAsset(input: RegisterAssetDTO): Promise<AssetEntity> {
    const datePrecision =
      input.datePrecision ?? (input.commissioningDate ? "exact" : "unknown");
    if ((datePrecision === "unknown") !== (input.commissioningDate == null)) {
      throw new InvariantViolationError(
        "Commissioning date and date precision must be supplied together.",
      );
    }
    const geo =
      input.latitude != null && input.longitude != null
        ? new GeoTag(input.latitude, input.longitude)
        : null;

    return this.session.withTransaction(async (_tx, procs) => {
      let row = await procs.createAsset({
        departmentId: input.departmentId,
        data: {
          asset_code: input.assetCode,
          name: input.name,
          template_code: input.templateCode,
          template_version: input.templateVersion,
          attributes: input.attributes ?? {},
          region_id: input.regionId,
          latitude: geo?.latitude,
          longitude: geo?.longitude,
          source_reference: input.sourceReference,
          owner_reference: input.ownerReference,
          custodian_reference: input.custodianReference,
          commissioning_date: input.commissioningDate,
          date_precision: datePrecision,
        },
        requestId: crypto.randomUUID(),
      });

      if (
        input.measureValue != null ||
        input.measureUnit != null ||
        input.responsibleOfficer != null
      ) {
        row = await procs.setAssetManagement({
          id: row.id,
          expectedVersion: row.version,
          patch: {
            ...(input.measureValue != null
              ? { measure_value: input.measureValue }
              : {}),
            ...(input.measureUnit != null
              ? { measure_unit: input.measureUnit }
              : {}),
            ...(input.responsibleOfficer != null
              ? { responsible_officer: input.responsibleOfficer }
              : {}),
          },
          reason: "Set management information during asset registration",
        });
      }

      return this.assetRepo.toEntity(row);
    });
  }

  async editAsset(params: {
    assetId: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<AssetEntity> {
    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.editAsset({
        id: params.assetId,
        expectedVersion: params.expectedVersion,
        patch: params.patch,
        reason: params.reason,
      });

      return this.assetRepo.toEntity(row);
    });
  }

  async transitionLifecycle(params: {
    assetId: string;
    expectedVersion: number;
    action: string;
    reason: string;
  }): Promise<AssetEntity> {
    return this.session.withTransaction(async (_tx, procs) => {
      const row = await procs.transitionAsset({
        id: params.assetId,
        expectedVersion: params.expectedVersion,
        action: params.action,
        reason: params.reason,
      });

      return this.assetRepo.toEntity(row);
    });
  }

  async updateGeotag(params: {
    assetId: string;
    expectedVersion: number;
    latitude: number;
    longitude: number;
    reason: string;
  }): Promise<AssetEntity> {
    const geo = new GeoTag(params.latitude, params.longitude);

    return this.editAsset({
      assetId: params.assetId,
      expectedVersion: params.expectedVersion,
      patch: { latitude: geo.latitude, longitude: geo.longitude },
      reason: params.reason,
    });
  }

  async flagDuplicate(params: {
    assetId: string;
    candidateId: string;
    reason: string;
  }): Promise<Record<string, unknown>> {
    return this.session.withTransaction(async (_tx, procs) => {
      return procs.flagDuplicate(params);
    });
  }

  async reviewDuplicate(params: {
    id: string;
    confirm: boolean;
    reason: string;
  }): Promise<Record<string, unknown>> {
    return this.session.withTransaction(async (_tx, procs) => {
      return procs.reviewDuplicate(params);
    });
  }

  /**
   * Enforces the four-eyes verification principle:
   * The verifier MUST NOT be the same actor who created the asset registration.
   */
  async verifyAsset(params: {
    assetId: string;
    expectedVersion: number;
    reason: string;
  }): Promise<AssetEntity> {
    const existing = await this.assetRepo.findById(params.assetId);
    if (!existing) {
      throw new NotFoundError(`Asset with ID ${params.assetId} not found`);
    }

    if (existing.createdBy === this.session.actorId) {
      throw new InvariantViolationError(
        "Four-eyes principle violation: You cannot verify an asset that you created.",
      );
    }

    return this.transitionLifecycle({
      assetId: params.assetId,
      expectedVersion: params.expectedVersion,
      action: "verify",
      reason: params.reason,
    });
  }
}
