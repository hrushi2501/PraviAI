import { count, eq, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { DatabaseSession } from "../db/session";

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  where?: SQL;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle generic table reference requires any for dynamic from() target
type DynamicTable = any;

/**
 * Generic Base Repository providing standard queries, server-side pagination,
 * and mapping to Domain Entities. Follows the Open/Closed Principle.
 */
export abstract class BaseRepository<TEntity, TTable extends PgTable> {
  constructor(
    protected readonly session: DatabaseSession,
    protected readonly table: TTable,
  ) {}

  abstract toEntity(row: unknown): TEntity;

  async findById(id: string): Promise<TEntity | null> {
    const tableWithId = this.table as unknown as { id: unknown };
    const rows = await this.session.withQuery(async (tx) =>
      tx
        .select()
        .from(this.table as DynamicTable)
        .where(eq(tableWithId.id as DynamicTable, id))
        .limit(1),
    );

    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findPaginated(
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<TEntity>> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const [totalRes, rows] = await this.session.withQuery(async (tx) => {
      const countQuery = tx
        .select({ count: count() })
        .from(this.table as DynamicTable);

      const dataQuery = tx
        .select()
        .from(this.table as DynamicTable)
        .limit(pageSize)
        .offset(offset);

      if (options.where) {
        countQuery.where(options.where);
        dataQuery.where(options.where);
      }

      return Promise.all([countQuery, dataQuery]);
    });
    const total = Number(totalRes[0]?.count ?? 0);

    return {
      items: rows.map((r) => this.toEntity(r)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }
}
