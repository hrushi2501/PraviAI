import { InvariantViolationError } from "@/server/db/error-mapper";
import type { VersionToken } from "../value-objects/version-token";

export type ComplaintChannel = "internal" | "phone" | "email" | "other";
export type ComplaintSeverity = "low" | "medium" | "high" | "critical";
export type ComplaintStatus =
  | "open"
  | "triaged"
  | "investigating"
  | "resolved"
  | "reopened";

export interface ComplaintProps {
  id: string;
  departmentId: string;
  channel: ComplaintChannel;
  narrative: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  assetId: string | null;
  resolutionNotes: string | null;
  version: VersionToken;
  createdAt: Date;
}

export class ComplaintEntity {
  constructor(private readonly props: ComplaintProps) {}

  get id(): string {
    return this.props.id;
  }

  get departmentId(): string {
    return this.props.departmentId;
  }

  get channel(): ComplaintChannel {
    return this.props.channel;
  }

  get narrative(): string {
    return this.props.narrative;
  }

  get severity(): ComplaintSeverity {
    return this.props.severity;
  }

  get status(): ComplaintStatus {
    return this.props.status;
  }

  get assetId(): string | null {
    return this.props.assetId;
  }

  get resolutionNotes(): string | null {
    return this.props.resolutionNotes;
  }

  get version(): VersionToken {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isCritical(): boolean {
    return this.props.severity === "critical";
  }

  get isUnlinked(): boolean {
    return this.props.assetId === null;
  }

  get isResolved(): boolean {
    return this.props.status === "resolved";
  }

  /**
   * Asserts whether a status transition is permitted by the grievance state machine.
   */
  canTransitionTo(target: ComplaintStatus): boolean {
    const validTransitions: Record<ComplaintStatus, ComplaintStatus[]> = {
      open: ["triaged"],
      triaged: ["investigating"],
      investigating: ["resolved"],
      resolved: ["reopened"],
      reopened: ["triaged"],
    };

    return validTransitions[this.props.status]?.includes(target) ?? false;
  }

  assertCanTransitionTo(target: ComplaintStatus): void {
    if (!this.canTransitionTo(target)) {
      throw new InvariantViolationError(
        `Invalid complaint transition: cannot transition from ${this.props.status} to ${target}.`,
      );
    }
  }

  toJSON() {
    return {
      id: this.id,
      departmentId: this.departmentId,
      channel: this.channel,
      narrative: this.narrative,
      severity: this.severity,
      status: this.status,
      assetId: this.assetId,
      resolutionNotes: this.resolutionNotes,
      version: this.version.toNumber(),
      createdAt: this.createdAt.toISOString(),
      isCritical: this.isCritical,
      isUnlinked: this.isUnlinked,
      isResolved: this.isResolved,
    };
  }
}
