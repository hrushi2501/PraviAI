import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { type AssetSelect, assets } from "@/db/schema/assets";
import { assetCurrentConditionView } from "@/db/schema/views";
import type { DatabaseSession } from "../db/session";
import { AssetEntity } from "../domain/entities/asset.entity";
import { BaseRepository, type PaginatedResult } from "./base.repository";

export class AssetRepository extends BaseRepository<
  AssetEntity,
  typeof assets
> {
  constructor(session: DatabaseSession) {
    super(session, assets);
  }

  toEntity(row: unknown): AssetEntity {
    return new AssetEntity(row as AssetSelect);
  }

  async findByDepartment(
    departmentId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResult<AssetEntity>> {
    return this.findPaginated({
      page,
      pageSize,
      where: and(
        eq(assets.departmentId, departmentId),
        isNull(assets.archivedAt),
      ),
    });
  }

  async findWithCondition(assetId: string) {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select({
          asset: assets,
          condition: {
            currentCondition: assetCurrentConditionView.currentCondition,
            lastAssessedCondition:
              assetCurrentConditionView.lastAssessedCondition,
            assessmentFreshness: assetCurrentConditionView.assessmentFreshness,
            observedOn: assetCurrentConditionView.observedOn,
            nextReviewOn: assetCurrentConditionView.nextReviewOn,
            inspectionId: assetCurrentConditionView.inspectionId,
          },
        })
        .from(assets)
        .leftJoin(
          assetCurrentConditionView,
          eq(assetCurrentConditionView.assetId, assets.id),
        )
        .where(eq(assets.id, assetId))
        .limit(1),
    );

    if (!rows[0]) return null;

    return {
      asset: this.toEntity(rows[0].asset),
      condition: rows[0].condition,
    };
  }

  async findInBBox(bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    departmentId?: string;
  }): Promise<AssetEntity[]> {
    const conditions = [
      gte(assets.latitude, bounds.minLat.toString()),
      lte(assets.latitude, bounds.maxLat.toString()),
      gte(assets.longitude, bounds.minLng.toString()),
      lte(assets.longitude, bounds.maxLng.toString()),
      isNull(assets.archivedAt),
    ];

    if (bounds.departmentId) {
      conditions.push(eq(assets.departmentId, bounds.departmentId));
    }

    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(assets)
        .where(and(...conditions))
        .limit(500),
    );

    return rows.map((r) => this.toEntity(r));
  }
}
