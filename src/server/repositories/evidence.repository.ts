import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { evidence } from "@/db/schema/evidence";
import type { DatabaseSession } from "../db/session";

export type EvidenceMetadata = Omit<typeof evidence.$inferSelect, "objectKey">;

const { objectKey: _objectKey, ...metadataColumns } = getTableColumns(evidence);

export class EvidenceRepository {
  constructor(private readonly session: DatabaseSession) {}

  async findByAsset(assetId: string): Promise<EvidenceMetadata[]> {
    return this.session.withQuery(async (tx) =>
      tx
        .select(metadataColumns)
        .from(evidence)
        .where(and(eq(evidence.assetId, assetId), isNull(evidence.removedAt)))
        .orderBy(desc(evidence.createdAt)),
    );
  }

  async findById(id: string): Promise<EvidenceMetadata | null> {
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select(metadataColumns)
        .from(evidence)
        .where(eq(evidence.id, id))
        .limit(1),
    );

    return rows[0] ?? null;
  }
}
