"use server";

import { and, asc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  authorities,
  authorityMemberships,
  departmentMemberships,
  departments,
  identities,
  roleDefinitions,
} from "@/db/schema/identities";
import { ForbiddenError } from "../db/error-mapper";
import { withAuthenticatedAction } from "./action-client";

export async function getAdminDirectoryAction(input: {
  authorityId: string;
  page?: number;
  search?: string;
  departmentId?: string;
  role?: string;
  status?: string;
}) {
  return withAuthenticatedAction(async ({ session }, actorId) => {
    const options = z
      .object({
        authorityId: z.string().uuid(),
        page: z.number().int().min(1).max(100000).default(1),
        search: z.string().trim().max(200).default(""),
        departmentId: z.string().uuid().optional(),
        role: z.string().max(50).optional(),
        status: z.enum(["active", "inactive", "disabled"]).optional(),
      })
      .parse(input);
    return session.withQuery(async (tx) => {
      const [authority] = await tx
        .select({
          allowed: sql<boolean>`asset_manager.authority_admin(${authorities.id}) OR asset_manager.governance_permission(${authorities.id}, 'governance_approve')`,
        })
        .from(authorities)
        .where(
          and(
            eq(authorities.id, options.authorityId),
            eq(authorities.active, true),
          ),
        );
      if (!authority?.allowed)
        throw new ForbiddenError("Authority administration required");
      const authorityMember = (activeOnly = false) =>
        exists(
          tx
            .select({ id: authorityMemberships.clerkId })
            .from(authorityMemberships)
            .where(
              and(
                eq(authorityMemberships.authorityId, options.authorityId),
                eq(authorityMemberships.clerkId, identities.clerkId),
                activeOnly
                  ? sql`${authorityMemberships.active} AND (${authorityMemberships.expiresAt} IS NULL OR ${authorityMemberships.expiresAt} > now())`
                  : undefined,
              ),
            ),
        );
      const departmentMember = (activeOnly = false) =>
        exists(
          tx
            .select({ id: departmentMemberships.clerkId })
            .from(departmentMemberships)
            .where(
              and(
                eq(departmentMemberships.authorityId, options.authorityId),
                eq(departmentMemberships.clerkId, identities.clerkId),
                activeOnly
                  ? sql`${departmentMemberships.active} AND (${departmentMemberships.expiresAt} IS NULL OR ${departmentMemberships.expiresAt} > now())`
                  : undefined,
              ),
            ),
        );
      const active = or(authorityMember(true), departmentMember(true));
      const roleMatch = options.role
        ? or(
            exists(
              tx
                .select({ id: authorityMemberships.clerkId })
                .from(authorityMemberships)
                .where(
                  and(
                    eq(authorityMemberships.authorityId, options.authorityId),
                    eq(authorityMemberships.clerkId, identities.clerkId),
                    eq(authorityMemberships.role, options.role),
                  ),
                ),
            ),
            exists(
              tx
                .select({ id: departmentMemberships.clerkId })
                .from(departmentMemberships)
                .where(
                  and(
                    eq(departmentMemberships.authorityId, options.authorityId),
                    eq(departmentMemberships.clerkId, identities.clerkId),
                    eq(departmentMemberships.role, options.role),
                  ),
                ),
            ),
          )
        : undefined;
      const departmentMatch = options.departmentId
        ? exists(
            tx
              .select({ id: departmentMemberships.clerkId })
              .from(departmentMemberships)
              .where(
                and(
                  eq(departmentMemberships.authorityId, options.authorityId),
                  eq(departmentMemberships.clerkId, identities.clerkId),
                  eq(departmentMemberships.departmentId, options.departmentId),
                ),
              ),
          )
        : undefined;
      const needle = `%${options.search.replace(/[\\%_]/g, "\\$&")}%`;
      const searchMatch = options.search
        ? or(
            sql`${identities.displayName} ILIKE ${needle}`,
            sql`${identities.email} ILIKE ${needle}`,
            exists(
              tx
                .select({ id: departmentMemberships.clerkId })
                .from(departmentMemberships)
                .innerJoin(
                  departments,
                  eq(departments.id, departmentMemberships.departmentId),
                )
                .where(
                  and(
                    eq(departmentMemberships.authorityId, options.authorityId),
                    eq(departmentMemberships.clerkId, identities.clerkId),
                    sql`${departments.name} ILIKE ${needle}`,
                  ),
                ),
            ),
            exists(
              tx
                .select({ id: roleDefinitions.code })
                .from(roleDefinitions)
                .where(
                  and(
                    eq(roleDefinitions.authorityId, options.authorityId),
                    sql`${roleDefinitions.name} ILIKE ${needle}`,
                    or(
                      exists(
                        tx
                          .select({ id: authorityMemberships.clerkId })
                          .from(authorityMemberships)
                          .where(
                            and(
                              eq(
                                authorityMemberships.authorityId,
                                options.authorityId,
                              ),
                              eq(
                                authorityMemberships.clerkId,
                                identities.clerkId,
                              ),
                              eq(
                                authorityMemberships.role,
                                roleDefinitions.code,
                              ),
                            ),
                          ),
                      ),
                      exists(
                        tx
                          .select({ id: departmentMemberships.clerkId })
                          .from(departmentMemberships)
                          .where(
                            and(
                              eq(
                                departmentMemberships.authorityId,
                                options.authorityId,
                              ),
                              eq(
                                departmentMemberships.clerkId,
                                identities.clerkId,
                              ),
                              eq(
                                departmentMemberships.role,
                                roleDefinitions.code,
                              ),
                            ),
                          ),
                      ),
                    ),
                  ),
                ),
            ),
          )
        : undefined;
      const where = and(
        or(
          eq(identities.clerkId, actorId),
          authorityMember(),
          departmentMember(),
        ),
        roleMatch,
        departmentMatch,
        searchMatch,
        options.status === "disabled"
          ? sql`${identities.disabledAt} IS NOT NULL`
          : options.status === "active"
            ? sql`${identities.disabledAt} IS NULL AND (${active})`
            : options.status === "inactive"
              ? sql`NOT (${active})`
              : undefined,
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)::integer` })
        .from(identities)
        .where(where);
      const users = await tx
        .select({
          clerkId: identities.clerkId,
          email: identities.email,
          displayName: identities.displayName,
          emailVerified: identities.emailVerified,
          disabledAt: identities.disabledAt,
          locale: identities.locale,
          createdAt: identities.createdAt,
        })
        .from(identities)
        .where(where)
        .orderBy(asc(identities.displayName), asc(identities.clerkId))
        .limit(20)
        .offset((options.page - 1) * 20);
      const ids = users.map((user) => user.clerkId);
      const authorityMembers = ids.length
        ? await tx
            .select()
            .from(authorityMemberships)
            .where(
              and(
                eq(authorityMemberships.authorityId, options.authorityId),
                inArray(authorityMemberships.clerkId, ids),
              ),
            )
        : [];
      const departmentMembers = ids.length
        ? await tx
            .select({
              ...getDepartmentMemberColumns(),
              departmentName: departments.name,
            })
            .from(departmentMemberships)
            .innerJoin(
              departments,
              eq(departments.id, departmentMemberships.departmentId),
            )
            .where(
              and(
                eq(departmentMemberships.authorityId, options.authorityId),
                inArray(departmentMemberships.clerkId, ids),
              ),
            )
        : [];
      return {
        users,
        authorityMembers,
        departmentMembers,
        page: options.page,
        total: count?.total ?? 0,
        pageSize: 20,
        pageCount: Math.ceil((count?.total ?? 0) / 20),
      };
    });
  });
}
function getDepartmentMemberColumns() {
  return {
    authorityId: departmentMemberships.authorityId,
    departmentId: departmentMemberships.departmentId,
    clerkId: departmentMemberships.clerkId,
    role: departmentMemberships.role,
    active: departmentMemberships.active,
    grantedBy: departmentMemberships.grantedBy,
    expiresAt: departmentMemberships.expiresAt,
    updatedAt: departmentMemberships.updatedAt,
  };
}
