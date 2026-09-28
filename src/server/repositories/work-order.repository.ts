import { and, desc, eq, notInArray } from "drizzle-orm";
import { type WorkOrderSelect, workOrders } from "@/db/schema/operations";
import type { DatabaseSession } from "../db/session";
import { WorkOrderEntity } from "../domain/entities/work-order.entity";
import { BaseRepository } from "./base.repository";

export class WorkOrderRepository extends BaseRepository<
  WorkOrderEntity,
  typeof workOrders
> {
  constructor(session: DatabaseSession) {
    super(session, workOrders);
  }

  toEntity(row: unknown): WorkOrderEntity {
    return new WorkOrderEntity(row as WorkOrderSelect);
  }

  async findByAsset(assetId: string): Promise<WorkOrderEntity[]> {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(workOrders)
        .where(eq(workOrders.assetId, assetId))
        .orderBy(desc(workOrders.createdAt)),
    );

    return rows.map((r) => this.toEntity(r));
  }

  async findActiveQueue(departmentId: string): Promise<WorkOrderEntity[]> {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(workOrders)
        .where(
          and(
            eq(workOrders.departmentId, departmentId),
            notInArray(workOrders.status, ["accepted", "cancelled"]),
          ),
        )
        .orderBy(workOrders.targetOn, desc(workOrders.createdAt)),
    );

    return rows.map((r) => this.toEntity(r));
  }
}
