import { and, desc, eq } from "drizzle-orm";
import { type InspectionSelect, inspections } from "@/db/schema/operations";
import type { DatabaseSession } from "../db/session";
import { InspectionEntity } from "../domain/entities/inspection.entity";
import { BaseRepository } from "./base.repository";

export class InspectionRepository extends BaseRepository<
  InspectionEntity,
  typeof inspections
> {
  constructor(session: DatabaseSession) {
    super(session, inspections);
  }

  toEntity(row: unknown): InspectionEntity {
    return new InspectionEntity(row as InspectionSelect);
  }

  async findByAsset(assetId: string): Promise<InspectionEntity[]> {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(inspections)
        .where(eq(inspections.assetId, assetId))
        .orderBy(desc(inspections.observedOn), desc(inspections.createdAt)),
    );

    return rows.map((r) => this.toEntity(r));
  }

  async findLatestApproved(assetId: string): Promise<InspectionEntity | null> {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(inspections)
        .where(
          and(
            eq(inspections.assetId, assetId),
            eq(inspections.status, "approved"),
          ),
        )
        .orderBy(desc(inspections.observedOn), desc(inspections.reviewedAt))
        .limit(1),
    );

    return rows[0] ? this.toEntity(rows[0]) : null;
  }
}
