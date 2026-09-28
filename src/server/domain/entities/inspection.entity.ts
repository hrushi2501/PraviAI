import type { InspectionSelect } from "@/db/schema/operations";
import type { InspectionCondition } from "../types";
import { VersionToken } from "../value-objects/version-token";

export class InspectionEntity {
  public readonly id: string;
  public readonly departmentId: string;
  public readonly assetId: string;
  public readonly templateCode: string;
  public readonly templateVersion: number;
  public readonly observedOn: string;
  public readonly observations: Record<
    string,
    { condition: string; notes?: string }
  >;
  public readonly condition: InspectionCondition;
  public readonly limitations: string | null;
  public readonly nextReviewOn: string | null;
  public readonly status: string;
  public readonly supersedesId: string | null;
  public readonly decisionReason: string | null;
  public readonly createdBy: string;
  public readonly submittedBy: string | null;
  public readonly reviewedBy: string | null;
  public readonly reviewedAt: Date | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly versionToken: VersionToken;

  constructor(row: InspectionSelect) {
    this.id = row.id;
    this.departmentId = row.departmentId;
    this.assetId = row.assetId;
    this.templateCode = row.templateCode;
    this.templateVersion = row.templateVersion;
    this.observedOn = row.observedOn;
    this.observations = row.observations ?? {};
    this.condition = row.condition as InspectionCondition;
    this.limitations = row.limitations;
    this.nextReviewOn = row.nextReviewOn;
    this.status = row.status;
    this.supersedesId = row.supersedesId;
    this.decisionReason = row.decisionReason;
    this.createdBy = row.createdBy;
    this.submittedBy = row.submittedBy;
    this.reviewedBy = row.reviewedBy;
    this.reviewedAt = row.reviewedAt;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
    this.versionToken = new VersionToken(row.version);
  }

  isApproved(): boolean {
    return this.status === "approved";
  }

  isCritical(): boolean {
    return this.condition === "critical";
  }

  isSevere(): boolean {
    return this.condition === "poor" || this.condition === "critical";
  }

  isOverdue(asOfDate: Date = new Date()): boolean {
    if (!this.nextReviewOn) return false;
    const reviewDate = new Date(this.nextReviewOn);
    return reviewDate < asOfDate;
  }
  toJSON() {
    const { versionToken: _versionToken, ...fields } = this;
    return {
      ...fields,
      version: this.versionToken.toNumber(),
    };
  }
}
