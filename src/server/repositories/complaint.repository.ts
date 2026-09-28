import { and, desc, eq, isNull } from "drizzle-orm";
import { type ComplaintSelect, complaints } from "@/db/schema/operations";
import type { DatabaseSession } from "../db/session";
import {
  ComplaintEntity,
  type ComplaintSeverity,
  type ComplaintStatus,
} from "../domain/entities/complaint.entity";
import { VersionToken } from "../domain/value-objects/version-token";
import { BaseRepository } from "./base.repository";

export class ComplaintRepository extends BaseRepository<
  ComplaintEntity,
  typeof complaints
> {
  constructor(session: DatabaseSession) {
    super(session, complaints);
  }

  toEntity(row: ComplaintSelect): ComplaintEntity {
    return new ComplaintEntity({
      id: row.id,
      departmentId: row.departmentId,
      channel: (row.channel as "internal") ?? "internal",
      narrative: row.narrative,
      severity: (row.reportedSeverity as ComplaintSeverity) ?? "medium",
      status: (row.status as ComplaintStatus) ?? "open",
      assetId: row.assetId,
      resolutionNotes: row.resolution,
      version: new VersionToken(row.version),
      createdAt: row.createdAt,
    });
  }

  async findByDepartment(
    departmentId: string,
    filter?: { status?: ComplaintStatus; severity?: ComplaintSeverity },
  ): Promise<ComplaintEntity[]> {
    return this.session.withQuery(async (tx) => {
      const conditions = [eq(complaints.departmentId, departmentId)];
      if (filter?.status) {
        conditions.push(eq(complaints.status, filter.status));
      }
      if (filter?.severity) {
        conditions.push(eq(complaints.reportedSeverity, filter.severity));
      }

      const rows = await tx
        .select()
        .from(complaints)
        .where(and(...conditions))
        .orderBy(desc(complaints.createdAt));

      return rows.map((r) => this.toEntity(r));
    });
  }

  async findByAsset(assetId: string): Promise<ComplaintEntity[]> {
    return this.session.withQuery(async (tx) => {
      const rows = await tx
        .select()
        .from(complaints)
        .where(eq(complaints.assetId, assetId))
        .orderBy(desc(complaints.createdAt));

      return rows.map((r) => this.toEntity(r));
    });
  }

  async findUnlinked(departmentId?: string): Promise<ComplaintEntity[]> {
    return this.session.withQuery(async (tx) => {
      const conditions = [isNull(complaints.assetId)];
      if (departmentId) {
        conditions.push(eq(complaints.departmentId, departmentId));
      }

      const rows = await tx
        .select()
        .from(complaints)
        .where(and(...conditions))
        .orderBy(desc(complaints.createdAt));

      return rows.map((r) => this.toEntity(r));
    });
  }
}
