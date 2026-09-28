"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, desc, eq, exists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { regions } from "@/db/schema/geography";
import { governanceRequests } from "@/db/schema/governance";
import {
  authorities,
  authorityMemberships,
  departmentMemberships,
  departments,
  identities,
  permissionCatalog,
  roleDefinitions,
  rolePermissions,
} from "@/db/schema/identities";
import { ForbiddenError, InvariantViolationError } from "../db/error-mapper";
import { withAuthenticatedAction } from "./action-client";

const reasonSchema = z.string().trim().min(1).max(4000);
const roleCode = z.string().regex(/^[a-z][a-z0-9_]{0,49}$/);
const nameSchema = z.string().trim().min(1).max(200);
const permissionsSchema = z.array(z.string().min(1).max(80)).max(50);
const proposalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("department_create"),
    payload: z.strictObject({
      code: z.string().trim().min(1).max(60),
      name: nameSchema,
      manager: z.string().min(1).max(200),
      manager_role: roleCode,
    }),
  }),
  z.object({
    action: z.literal("region_create"),
    payload: z.strictObject({
      parent_id: z.string().uuid().nullable().optional(),
      code: z.string().trim().min(1).max(60),
      name: nameSchema,
      level: z.enum(["state", "district", "block", "city", "ward", "village"]),
    }),
  }),
  z.object({
    action: z.literal("role_create"),
    payload: z.strictObject({
      code: roleCode,
      name: nameSchema,
      scope: z.enum(["authority", "department"]),
      permissions: permissionsSchema,
    }),
  }),
  z.object({
    action: z.literal("role_edit"),
    payload: z.strictObject({
      code: roleCode,
      name: nameSchema.optional(),
      scope: z.enum(["authority", "department"]).optional(),
      permissions: permissionsSchema,
      expected_version: z.number().int().positive(),
    }),
  }),
  z.object({
    action: z.literal("role_retire"),
    payload: z.strictObject({
      code: roleCode,
      expected_version: z.number().int().positive(),
    }),
  }),
  z.object({
    action: z.literal("authority_member"),
    payload: z.strictObject({
      clerk_id: z.string().min(1).max(200),
      role: roleCode,
      active: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal("department_member"),
    payload: z.strictObject({
      department_id: z.string().uuid(),
      clerk_id: z.string().min(1).max(200),
      role: roleCode,
      active: z.boolean(),
    }),
  }),
]);

export type GovernanceProposalInput = z.infer<typeof proposalSchema> & {
  authorityId: string;
  reason: string;
  requestId?: string;
};

export async function getAdminSetupAction(authorityId?: string) {
  return withAuthenticatedAction(async ({ session }, actorId) =>
    session.withQuery(async (tx) => {
      const requestedId = authorityId
        ? z.string().uuid().parse(authorityId)
        : undefined;
      const authorityRows = await tx
        .select({
          id: authorities.id,
          code: authorities.code,
          name: authorities.name,
          canAdmin: sql<boolean>`asset_manager.authority_admin(${authorities.id})`,
          canApprove: sql<boolean>`asset_manager.governance_permission(${authorities.id}, 'governance_approve')`,
        })
        .from(authorities)
        .where(eq(authorities.active, true))
        .orderBy(asc(authorities.name))
        .limit(101);
      const selected = requestedId
        ? authorityRows.find((row) => row.id === requestedId)
        : authorityRows.find((row) => row.canAdmin || row.canApprove);
      if (
        requestedId &&
        (!selected || (!selected.canAdmin && !selected.canApprove))
      )
        throw new ForbiddenError(
          "Authority administration or governance approval required",
        );
      const base = {
        actorId,
        authorities: authorityRows.slice(0, 100),
        selectedAuthorityId: selected?.id ?? null,
        canAdmin: selected?.canAdmin ?? false,
        canApprove: selected?.canApprove ?? false,
      };
      if (!selected)
        return {
          ...base,
          departments: [],
          regions: [],
          roles: [],
          rolePermissions: [],
          permissionCatalog: [],
          eligibleIdentities: [],
          users: [],
          authorityMembers: [],
          departmentMembers: [],
          governanceRequests: [],
          truncated: authorityRows.length > 100,
        };
      const id = selected.id;
      const [
        departmentRows,
        regionRows,
        roleRows,
        permissionRows,
        catalogRows,
        identityRows,
        authorityMembers,
        departmentMembers,
        requests,
      ] = await Promise.all([
        tx
          .select()
          .from(departments)
          .where(eq(departments.authorityId, id))
          .orderBy(asc(departments.name))
          .limit(101),
        tx
          .select()
          .from(regions)
          .where(eq(regions.authorityId, id))
          .orderBy(asc(regions.name))
          .limit(101),
        tx
          .select()
          .from(roleDefinitions)
          .where(eq(roleDefinitions.authorityId, id))
          .orderBy(asc(roleDefinitions.name))
          .limit(101),
        tx
          .select()
          .from(rolePermissions)
          .where(eq(rolePermissions.authorityId, id))
          .orderBy(asc(rolePermissions.role), asc(rolePermissions.permission))
          .limit(1001),
        tx
          .select()
          .from(permissionCatalog)
          .orderBy(asc(permissionCatalog.scope), asc(permissionCatalog.code))
          .limit(101),
        tx
          .select({
            clerkId: identities.clerkId,
            email: identities.email,
            displayName: identities.displayName,
            emailVerified: identities.emailVerified,
            disabledAt: identities.disabledAt,
            createdAt: identities.createdAt,
            locale: identities.locale,
          })
          .from(identities)
          .where(
            or(
              eq(identities.clerkId, actorId),
              exists(
                tx
                  .select({ id: sql`1` })
                  .from(authorityMemberships)
                  .where(
                    and(
                      eq(authorityMemberships.authorityId, id),
                      eq(authorityMemberships.clerkId, identities.clerkId),
                    ),
                  ),
              ),
              exists(
                tx
                  .select({ id: sql`1` })
                  .from(departmentMemberships)
                  .where(
                    and(
                      eq(departmentMemberships.authorityId, id),
                      eq(departmentMemberships.clerkId, identities.clerkId),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(asc(identities.displayName))
          .limit(101),
        tx
          .select()
          .from(authorityMemberships)
          .where(eq(authorityMemberships.authorityId, id))
          .orderBy(asc(authorityMemberships.clerkId))
          .limit(101),
        tx
          .select()
          .from(departmentMemberships)
          .where(eq(departmentMemberships.authorityId, id))
          .orderBy(asc(departmentMemberships.clerkId))
          .limit(101),
        tx
          .select()
          .from(governanceRequests)
          .where(eq(governanceRequests.authorityId, id))
          .orderBy(desc(governanceRequests.createdAt))
          .limit(101),
      ]);
      return {
        ...base,
        departments: departmentRows.slice(0, 100),
        regions: regionRows.slice(0, 100),
        roles: roleRows.slice(0, 100),
        rolePermissions: permissionRows.slice(0, 1000),
        permissionCatalog: catalogRows.slice(0, 100),
        users: identityRows.slice(0, 100),
        eligibleIdentities: identityRows
          .filter((user) => user.emailVerified && user.disabledAt === null)
          .slice(0, 100),
        authorityMembers: authorityMembers.slice(0, 100),
        departmentMembers: departmentMembers.slice(0, 100),
        governanceRequests: requests.slice(0, 100),
        truncated:
          authorityRows.length > 100 ||
          permissionRows.length > 1000 ||
          [
            departmentRows,
            regionRows,
            roleRows,
            catalogRows,
            identityRows,
            authorityMembers,
            departmentMembers,
            requests,
          ].some((rows) => rows.length > 100),
      };
    }),
  );
}

export async function requestGovernanceAction(input: {
  authorityId: string;
  action: GovernanceProposalInput["action"];
  payload: Record<string, unknown>;
  reason: string;
  requestId?: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const scope = z
      .object({
        authorityId: z.string().uuid(),
        reason: reasonSchema,
        requestId: z.string().uuid().optional(),
      })
      .parse(input);
    const proposal = proposalSchema.parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.requestGovernance({
        ...scope,
        ...proposal,
        requestId: scope.requestId ?? crypto.randomUUID(),
      }),
    );
  });
}

export async function decideGovernanceAction(input: {
  id: string;
  approve: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = z
      .strictObject({
        id: z.string().uuid(),
        approve: z.boolean(),
        reason: reasonSchema,
      })
      .parse(input);
    return session.withTransaction(async (_tx, procedures) =>
      procedures.decideGovernance(params),
    );
  });
}

export async function cancelGovernanceAction(input: {
  id: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = z
      .strictObject({ id: z.string().uuid(), reason: reasonSchema })
      .parse(input);
    await session.withTransaction(async (_tx, procedures) =>
      procedures.cancelGovernance(params),
    );
    return { cancelled: true };
  });
}

export async function editDepartmentAction(input: {
  id: string;
  expectedVersion: number;
  name: string;
  active: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = z
      .strictObject({
        id: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        name: nameSchema,
        active: z.boolean(),
        reason: reasonSchema,
      })
      .parse(input);
    return session.withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT asset_manager.edit_department(${params.id}::uuid, ${params.expectedVersion}::integer, ${params.name}, ${params.active}::boolean, ${params.reason})`,
      );
      const [row] = await tx
        .select()
        .from(departments)
        .where(eq(departments.id, params.id))
        .limit(1);
      return row;
    });
  });
}

export async function editRegionAction(input: {
  id: string;
  name: string;
  active: boolean;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const params = z
      .strictObject({
        id: z.string().uuid(),
        name: nameSchema,
        active: z.boolean(),
        reason: reasonSchema,
      })
      .parse(input);
    return session.withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT asset_manager.edit_region(${params.id}::uuid, ${params.name}, ${params.active}::boolean, ${params.reason})`,
      );
      const [row] = await tx
        .select()
        .from(regions)
        .where(eq(regions.id, params.id))
        .limit(1);
      return row;
    });
  });
}

/** Exact-email onboarding lookup for an administrator; grants remain governed separately. */
export async function findVerifiedOfficialAction(input: {
  authorityId: string;
  email: string;
}) {
  return withAuthenticatedAction(async ({ session, services }) => {
    const params = z
      .strictObject({
        authorityId: z.string().uuid(),
        email: z.email().trim().toLowerCase().max(320),
      })
      .parse(input);
    const authorised = await session.withQuery(async (tx) => {
      const [row] = await tx
        .select({
          allowed: sql<boolean>`asset_manager.authority_admin(${authorities.id})`,
        })
        .from(authorities)
        .where(
          and(
            eq(authorities.id, params.authorityId),
            eq(authorities.active, true),
          ),
        )
        .limit(1);
      return row?.allowed === true;
    });
    if (!authorised)
      throw new ForbiddenError(
        "Authority administration required to find an official",
      );
    const client = await clerkClient();
    const response = await client.users.getUserList({
      emailAddress: [params.email],
      limit: 2,
    });
    if (response.totalCount !== 1 || response.data.length !== 1)
      throw new InvariantViolationError(
        "One existing verified account with this primary email is required",
      );
    const user = response.data[0];
    const email = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );
    if (
      !email ||
      email.emailAddress.trim().toLowerCase() !== params.email ||
      email.verification?.status !== "verified" ||
      user.banned ||
      user.locked
    ) {
      throw new InvariantViolationError(
        "Account must be enabled with this verified primary email",
      );
    }
    if (
      !Number.isFinite(user.updatedAt) ||
      user.updatedAt <= 0 ||
      user.updatedAt > Date.now() + 5 * 60 * 1000
    )
      throw new InvariantViolationError(
        "Account has no valid identity update timestamp",
      );
    const identityState = async () =>
      session.withSystemTransaction(async (tx) => {
        const rows = await tx.execute(
          session.isLegacyDevelopmentConnection
            ? sql`SELECT
        EXISTS(SELECT 1 FROM asset_manager.identity_tombstones WHERE clerk_id=${user.id}) AS deprovisioned,
        EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=${user.id} AND disabled_at IS NOT NULL) AS disabled,
        EXISTS(SELECT 1 FROM asset_manager.identities WHERE clerk_id=${user.id} AND email=${params.email} AND email_verified AND disabled_at IS NULL) AS verified`
            : sql`SELECT asset_manager.lookup_identity_state(${user.id},${params.email}) AS state`,
        );
        type State = {
          deprovisioned: boolean;
          disabled: boolean;
          verified: boolean;
        };
        const [row] = rows as unknown as Array<State & { state?: State }>;
        return session.isLegacyDevelopmentConnection ? row : row?.state;
      });
    const existing = await identityState();
    if (!existing || existing.deprovisioned || existing.disabled)
      throw new InvariantViolationError(
        "Deprovisioned accounts cannot be assigned; identity recovery is required",
      );
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      email.emailAddress;
    const language = user.locale?.split("-")[0].toLowerCase();
    const locale =
      language && ["en", "hi", "gu", "mr", "bn", "ta", "te"].includes(language)
        ? language
        : "en";
    await services.identity.syncUser({
      clerkId: user.id,
      email: email.emailAddress,
      name: displayName,
      verified: true,
      sourceUpdatedAt: new Date(user.updatedAt),
      locale,
    });
    const reconciled = await identityState();
    if (
      !reconciled ||
      reconciled.deprovisioned ||
      reconciled.disabled ||
      !reconciled.verified
    )
      throw new InvariantViolationError(
        "Identity reconciliation could not establish an eligible official",
      );
    return { clerkId: user.id, email: email.emailAddress, displayName };
  });
}

export async function createInvitationAction(params: {
  departmentId: string;
  email: string;
  role: string;
  expiresInDays?: number;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        departmentId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        role: roleCode,
        expiresInDays: z.number().int().min(1).max(30).default(7),
      })
      .parse(params);

    const expiresAt = new Date(
      Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    return session.withTransaction(async (_tx, procs) => {
      return procs.createInvitation({
        departmentId: validated.departmentId,
        email: validated.email,
        role: validated.role,
        expiresAt,
        requestId: crypto.randomUUID(),
      });
    });
  });
}

export async function revokeInvitationAction(params: {
  id: string;
  reason: string;
}) {
  return withAuthenticatedAction(async ({ session }) => {
    const validated = z
      .strictObject({
        id: z.string().uuid(),
        reason: reasonSchema,
      })
      .parse(params);

    return session.withTransaction(async (_tx, procs) => {
      return procs.revokeInvitation({
        id: validated.id,
        reason: validated.reason,
      });
    });
  });
}
