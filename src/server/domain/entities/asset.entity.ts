import type { AssetSelect } from "@/db/schema/assets";
import type { LifecycleStage, RegistrationStatus } from "../types";
import { GeoTag } from "../value-objects/geo-tag";
import { VersionToken } from "../value-objects/version-token";

export class AssetEntity {
  public readonly id: string;
  public readonly departmentId: string;
  public readonly authorityId: string;
  public readonly assetCode: string;
  public readonly name: string;
  public readonly templateCode: string;
  public readonly templateVersion: number;
  public readonly attributes: Record<string, unknown>;
  public readonly regionId: string | null;
  public readonly geoTag: GeoTag | null;
  public readonly registrationStatus: RegistrationStatus;
  public readonly lifecycleStage: LifecycleStage;
  public readonly versionToken: VersionToken;
  public readonly retiredAt: Date | null;
  public readonly archivedAt: Date | null;
  public readonly measureValue: number | null;
  public readonly measureUnit: string | null;
  public readonly responsibleOfficer: string | null;
  public readonly parentAssetId: string | null;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(row: AssetSelect) {
    this.id = row.id;
    this.departmentId = row.departmentId;
    this.authorityId = row.authorityId;
    this.assetCode = row.assetCode;
    this.name = row.name;
    this.templateCode = row.templateCode;
    this.templateVersion = row.templateVersion;
    this.attributes = row.attributes ?? {};
    this.regionId = row.regionId;
    this.geoTag = GeoTag.tryCreate(row.latitude, row.longitude);
    this.registrationStatus = row.registrationStatus as RegistrationStatus;
    this.lifecycleStage = row.lifecycleStage as LifecycleStage;
    this.versionToken = new VersionToken(row.version);
    this.retiredAt = row.retiredAt;
    this.archivedAt = row.archivedAt;
    this.measureValue = row.measureValue ? Number(row.measureValue) : null;
    this.measureUnit = row.measureUnit;
    this.responsibleOfficer = row.responsibleOfficer;
    this.parentAssetId = row.parentAssetId;
    this.createdBy = row.createdBy;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }

  isVerified(): boolean {
    return this.registrationStatus === "verified";
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  isRetired(): boolean {
    return this.retiredAt !== null;
  }

  isActive(): boolean {
    return !this.isArchived() && !this.isRetired();
  }

  canTransitionTo(targetStage: LifecycleStage): boolean {
    if (!this.isActive()) return false;
    const allowedTransitions: Record<LifecycleStage, LifecycleStage[]> = {
      planned: ["construction"],
      construction: ["commissioned"],
      commissioned: ["retired"],
      retired: [],
    };
    return (
      allowedTransitions[this.lifecycleStage]?.includes(targetStage) ?? false
    );
  }

  getFormattedMeasure(): string | null {
    if (this.measureValue == null || !this.measureUnit) return null;
    return `${this.measureValue.toLocaleString("en-IN")} ${this.measureUnit}`;
  }
  toJSON() {
    const { versionToken: _versionToken, geoTag: _geoTag, ...fields } = this;
    return {
      ...fields,
      version: this.versionToken.toNumber(),
      geoTag: this.geoTag?.toPoint() ?? null,
    };
  }
}
