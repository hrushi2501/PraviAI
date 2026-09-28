import {
  getTableColumns,
  type InferSelectModel,
  type SQL,
  type SQLWrapper,
  sql,
  type Table,
} from "drizzle-orm";
import { type AssetSelect, assets } from "@/db/schema/assets";
import { type EvidenceSelect, evidence } from "@/db/schema/evidence";
import {
  type ApprovalRequestSelect,
  approvalRequests,
  type GovernanceRequestSelect,
  governanceRequests,
  type InvitationSelect,
  invitations,
} from "@/db/schema/governance";
import {
  type ComplaintSelect,
  complaints,
  type InspectionSelect,
  inspections,
  type WorkEstimateSelect,
  type WorkOrderSelect,
  workEstimates,
  workOrders,
} from "@/db/schema/operations";

export interface SqlExecutor {
  execute(query: SQLWrapper | SQL): Promise<unknown>;
}

/** Raw execute() results use database names and bypass Drizzle column decoders. */
function decodeProcedureRow<T extends Table>(
  table: T,
  row: unknown,
): InferSelectModel<T> {
  if (!row || typeof row !== "object") {
    throw new Error("Stored procedure returned no record");
  }
  const raw = row as Record<string, unknown>;
  const decoded: Record<string, unknown> = {};
  for (const [property, column] of Object.entries(getTableColumns(table))) {
    const value = raw[column.name];
    decoded[property] =
      value == null ? value : column.mapFromDriverValue(value);
  }
  return decoded as InferSelectModel<T>;
}

export class StoredProcedureGateway {
  constructor(private readonly executor: SqlExecutor) {}

  // ---------------------------------------------------------------------------
  // ASSET PROCEDURES
  // ---------------------------------------------------------------------------

  async createAsset(params: {
    departmentId: string;
    data: Record<string, unknown>;
    requestId: string;
  }): Promise<AssetSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_asset(
        ${params.departmentId}::uuid,
        ${JSON.stringify(params.data)}::jsonb,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(assets, rows[0]);
  }

  async editAsset(params: {
    id: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<AssetSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.edit_asset(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${JSON.stringify(params.patch)}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(assets, rows[0]);
  }

  async transitionAsset(params: {
    id: string;
    expectedVersion: number;
    action: string;
    reason: string;
  }): Promise<AssetSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.transition_asset(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${params.action},
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(assets, rows[0]);
  }

  async setAssetGeotag(params: {
    id: string;
    expectedVersion: number;
    latitude: number;
    longitude: number;
    reason: string;
  }): Promise<AssetSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.set_asset_geotag(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${params.latitude}::numeric,
        ${params.longitude}::numeric,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(assets, rows[0]);
  }

  async setAssetManagement(params: {
    id: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<AssetSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.set_asset_management(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${JSON.stringify(params.patch)}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(assets, rows[0]);
  }

  async flagDuplicate(params: {
    assetId: string;
    candidateId: string;
    reason: string;
  }): Promise<Record<string, unknown>> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.flag_duplicate(
        ${params.assetId}::uuid,
        ${params.candidateId}::uuid,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return rows[0];
  }

  async reviewDuplicate(params: {
    id: string;
    confirm: boolean;
    reason: string;
  }): Promise<Record<string, unknown>> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.review_duplicate(
        ${params.id}::uuid,
        ${params.confirm}::boolean,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // INSPECTION PROCEDURES
  // ---------------------------------------------------------------------------

  async createInspection(params: {
    assetId: string;
    data: Record<string, unknown>;
    requestId: string;
  }): Promise<InspectionSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_inspection(
        ${params.assetId}::uuid,
        ${JSON.stringify(params.data)}::jsonb,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(inspections, rows[0]);
  }

  async editInspection(params: {
    id: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<InspectionSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.edit_inspection(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${JSON.stringify(params.patch)}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(inspections, rows[0]);
  }

  async transitionInspection(params: {
    id: string;
    expectedVersion: number;
    action: string;
    reason: string;
  }): Promise<InspectionSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.transition_inspection(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${params.action},
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(inspections, rows[0]);
  }

  // ---------------------------------------------------------------------------
  // COMPLAINT PROCEDURES
  // ---------------------------------------------------------------------------

  async createComplaint(params: {
    departmentId: string;
    data: Record<string, unknown>;
    requestId: string;
  }): Promise<ComplaintSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_complaint(
        ${params.departmentId}::uuid,
        ${JSON.stringify(params.data)}::jsonb,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(complaints, rows[0]);
  }

  async editComplaint(params: {
    id: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<ComplaintSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.edit_complaint(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${JSON.stringify(params.patch)}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(complaints, rows[0]);
  }

  async transitionComplaint(params: {
    id: string;
    expectedVersion: number;
    action: string;
    reason: string;
  }): Promise<ComplaintSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.transition_complaint(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${params.action},
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(complaints, rows[0]);
  }

  async linkComplaintAsset(params: {
    id: string;
    assetId: string;
    reason: string;
  }): Promise<ComplaintSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.link_complaint_asset(
        ${params.id}::uuid,
        ${params.assetId}::uuid,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(complaints, rows[0]);
  }

  // ---------------------------------------------------------------------------
  // WORK ORDER PROCEDURES
  // ---------------------------------------------------------------------------

  async createWorkOrder(params: {
    assetId: string;
    data: Record<string, unknown>;
    requestId: string;
  }): Promise<WorkOrderSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_work_order(
        ${params.assetId}::uuid,
        ${JSON.stringify(params.data)}::jsonb,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workOrders, rows[0]);
  }

  async editWorkOrder(params: {
    id: string;
    expectedVersion: number;
    patch: Record<string, unknown>;
    reason: string;
  }): Promise<WorkOrderSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.edit_work_order(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${JSON.stringify(params.patch)}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workOrders, rows[0]);
  }

  async transitionWorkOrder(params: {
    id: string;
    expectedVersion: number;
    action: string;
    data?: Record<string, unknown>;
    reason: string;
  }): Promise<WorkOrderSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.transition_work_order(
        ${params.id}::uuid,
        ${params.expectedVersion}::integer,
        ${params.action},
        ${JSON.stringify(params.data ?? {})}::jsonb,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workOrders, rows[0]);
  }

  async createWorkEstimate(params: {
    workOrderId: string;
    amountPaise: bigint | string;
    source: string;
    basis: string;
    date: string;
    requestId: string;
  }): Promise<WorkEstimateSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_work_estimate(
        ${params.workOrderId}::uuid,
        ${params.amountPaise.toString()}::bigint,
        ${params.source},
        ${params.basis},
        ${params.date}::date,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workEstimates, rows[0]);
  }

  async reviewWorkEstimate(params: {
    id: string;
    approve: boolean;
    reason: string;
  }): Promise<WorkEstimateSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.review_work_estimate(
        ${params.id}::uuid,
        ${params.approve}::boolean,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workEstimates, rows[0]);
  }

  async linkWorkVerification(params: {
    workId: string;
    expectedVersion: number;
    inspectionId: string;
    reason: string;
  }): Promise<WorkOrderSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.link_work_verification(
        ${params.workId}::uuid,
        ${params.expectedVersion}::integer,
        ${params.inspectionId}::uuid,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(workOrders, rows[0]);
  }

  // ---------------------------------------------------------------------------
  // EVIDENCE & AUDIT PROCEDURES
  // ---------------------------------------------------------------------------

  async attachEvidence(params: {
    assetId: string;
    data: {
      inspection_id?: string;
      work_order_id?: string;
      provider: string;
      object_key: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      caption?: string;
      sha256?: string;
      classification?: string;
    };
    requestId: string;
  }): Promise<EvidenceSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.attach_evidence(
        ${params.assetId}::uuid,
        ${JSON.stringify(params.data)}::jsonb,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(evidence, rows[0]);
  }

  async requestEvidenceAccess(params: {
    evidenceId: string;
    purpose: string;
  }): Promise<{ id: string; provider: string; object_key: string }> {
    const rows = (await this.executor.execute(sql`
      SELECT asset_manager.request_evidence_access(
        ${params.evidenceId}::uuid,
        ${params.purpose}
      ) AS res;
    `)) as unknown as [
      { res: { id: string; provider: string; object_key: string } },
    ];
    return rows[0]?.res;
  }

  async removeEvidence(params: { id: string; reason: string }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.remove_evidence(
        ${params.id}::uuid,
        ${params.reason}
      );
    `);
  }

  async recordMilestone(params: {
    assetId: string;
    kind: string;
    occurredOn: string;
    description: string;
    source: string;
    evidenceId?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.record_milestone(
        ${params.assetId}::uuid,
        ${params.kind},
        ${params.occurredOn}::date,
        ${params.description},
        ${params.source},
        ${params.evidenceId ? sql`${params.evidenceId}::uuid` : sql`NULL`},
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // IDENTITY & SECURITY PROCEDURES
  // ---------------------------------------------------------------------------

  async syncIdentity(params: {
    clerkId: string;
    email: string;
    name: string;
    verified: boolean;
    sourceUpdatedAt: Date;
    locale?: string;
  }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.sync_identity(
        ${params.clerkId},
        ${params.email},
        ${params.name},
        ${params.verified}::boolean,
        ${params.sourceUpdatedAt.toISOString()}::timestamptz,
        ${params.locale ?? "en"}
      );
    `);
  }

  async disableIdentity(params: {
    clerkId: string;
    sourceUpdatedAt: Date;
  }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.disable_identity(
        ${params.clerkId},
        ${params.sourceUpdatedAt.toISOString()}::timestamptz
      );
    `);
  }

  // ---------------------------------------------------------------------------
  // GEOGRAPHY & REGION PROCEDURES
  // ---------------------------------------------------------------------------

  async createRegion(params: {
    authorityId: string;
    parentId?: string | null;
    code: string;
    name: string;
    level: string;
  }): Promise<string> {
    const rows = (await this.executor.execute(sql`
      SELECT asset_manager.create_region(
        ${params.authorityId}::uuid,
        ${params.parentId ? sql`${params.parentId}::uuid` : sql`NULL`},
        ${params.code},
        ${params.name},
        ${params.level}
      ) AS id;
    `)) as unknown as [{ id: string }];
    return rows[0].id;
  }

  async setRegionLgd(params: {
    regionId: string;
    code: string;
    reason: string;
  }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.set_region_lgd(
        ${params.regionId}::uuid,
        ${params.code},
        ${params.reason}
      );
    `);
  }

  // ---------------------------------------------------------------------------
  // GOVERNANCE & TWO-PERSON APPROVAL PROCEDURES
  // ---------------------------------------------------------------------------

  async requestAssetAction(params: {
    assetId: string;
    expectedVersion: number;
    action: string;
    toValue?: string | null;
    reason: string;
    requestId: string;
  }): Promise<ApprovalRequestSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.request_asset_action(
        ${params.assetId}::uuid,
        ${params.expectedVersion}::integer,
        ${params.action},
        ${params.toValue ?? null},
        ${params.reason},
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(approvalRequests, rows[0]);
  }

  async decideAssetAction(params: {
    id: string;
    approve: boolean;
    reason: string;
  }): Promise<ApprovalRequestSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.decide_asset_action(
        ${params.id}::uuid,
        ${params.approve}::boolean,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(approvalRequests, rows[0]);
  }

  async cancelAssetAction(params: {
    id: string;
    reason: string;
  }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.cancel_asset_action(
        ${params.id}::uuid,
        ${params.reason}
      );
    `);
  }

  async requestGovernance(params: {
    authorityId: string;
    action: string;
    payload: Record<string, unknown>;
    reason: string;
    requestId: string;
  }): Promise<GovernanceRequestSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.request_governance(
        ${params.authorityId}::uuid,
        ${params.action},
        ${JSON.stringify(params.payload)}::jsonb,
        ${params.reason},
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(governanceRequests, rows[0]);
  }

  async decideGovernance(params: {
    id: string;
    approve: boolean;
    reason: string;
  }): Promise<GovernanceRequestSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.decide_governance(
        ${params.id}::uuid,
        ${params.approve}::boolean,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(governanceRequests, rows[0]);
  }

  async cancelGovernance(params: {
    id: string;
    reason: string;
  }): Promise<void> {
    await this.executor.execute(sql`
      SELECT asset_manager.cancel_governance(
        ${params.id}::uuid,
        ${params.reason}
      );
    `);
  }

  async createInvitation(params: {
    departmentId: string;
    email: string;
    role: string;
    expiresAt: string;
    requestId: string;
  }): Promise<InvitationSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.create_invitation(
        ${params.departmentId}::uuid,
        ${params.email},
        ${params.role},
        ${params.expiresAt}::timestamptz,
        ${params.requestId}::uuid
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(invitations, rows[0]);
  }

  async revokeInvitation(params: {
    id: string;
    reason: string;
  }): Promise<InvitationSelect> {
    const rows = (await this.executor.execute(sql`
      SELECT * FROM asset_manager.revoke_invitation(
        ${params.id}::uuid,
        ${params.reason}
      );
    `)) as unknown as Record<string, unknown>[];
    return decodeProcedureRow(invitations, rows[0]);
  }
}
