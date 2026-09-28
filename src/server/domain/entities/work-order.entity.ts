import type { WorkOrderSelect } from "@/db/schema/operations";
import type { WorkOrderStatus } from "../types";
import { MoneyPaise } from "../value-objects/money-paise";
import { VersionToken } from "../value-objects/version-token";

export class WorkOrderEntity {
  public readonly id: string;
  public readonly departmentId: string;
  public readonly assetId: string;
  public readonly inspectionId: string | null;
  public readonly complaintId: string | null;
  public readonly description: string;
  public readonly justification: string;
  public readonly status: WorkOrderStatus;
  public readonly assignedTo: string | null;
  public readonly targetOn: string | null;
  public readonly startedOn: string | null;
  public readonly completedOn: string | null;
  public readonly actualCost: MoneyPaise | null;
  public readonly completionNotes: string | null;
  public readonly approvedBy: string | null;
  public readonly approvedAt: Date | null;
  public readonly acceptedBy: string | null;
  public readonly acceptedAt: Date | null;
  public readonly decisionReason: string | null;
  public readonly verificationInspectionId: string | null;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly versionToken: VersionToken;

  constructor(row: WorkOrderSelect) {
    this.id = row.id;
    this.departmentId = row.departmentId;
    this.assetId = row.assetId;
    this.inspectionId = row.inspectionId;
    this.complaintId = row.complaintId;
    this.description = row.description;
    this.justification = row.justification;
    this.status = row.status as WorkOrderStatus;
    this.assignedTo = row.assignedTo;
    this.targetOn = row.targetOn;
    this.startedOn = row.startedOn;
    this.completedOn = row.completedOn;
    this.actualCost = row.actualCostPaise
      ? MoneyPaise.fromPaise(row.actualCostPaise)
      : null;
    this.completionNotes = row.completionNotes;
    this.approvedBy = row.approvedBy;
    this.approvedAt = row.approvedAt;
    this.acceptedBy = row.acceptedBy;
    this.acceptedAt = row.acceptedAt;
    this.decisionReason = row.decisionReason;
    this.verificationInspectionId = row.verificationInspectionId;
    this.createdBy = row.createdBy;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
    this.versionToken = new VersionToken(row.version);
  }

  isAccepted(): boolean {
    return this.status === "accepted";
  }

  isCancelled(): boolean {
    return this.status === "cancelled";
  }

  isOpen(): boolean {
    return !this.isAccepted() && !this.isCancelled();
  }

  requiresVerification(): boolean {
    return this.isAccepted() && this.verificationInspectionId === null;
  }
  toJSON() {
    const {
      versionToken: _versionToken,
      actualCost: _actualCost,
      ...fields
    } = this;
    return {
      ...fields,
      version: this.versionToken.toNumber(),
      actualCostPaise: this.actualCost?.amountPaise.toString() ?? null,
    };
  }
}
