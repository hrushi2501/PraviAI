import { getTableName, type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestGovernance: vi.fn(),
  decideGovernance: vi.fn(),
  cancelGovernance: vi.fn(),
  withTransaction: vi.fn(),
  withQuery: vi.fn(),
  withSystemTransaction: vi.fn(),
  syncUser: vi.fn(),
  clerkClient: vi.fn(),
  getUserList: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: mocks.clerkClient }));
vi.mock("@/server/actions/action-client", () => ({
  withAuthenticatedAction: async (
    callback: (container: unknown, actorId: string) => Promise<unknown>,
  ) => {
    try {
      return {
        success: true,
        data: await callback(
          {
            session: {
              withTransaction: mocks.withTransaction,
              withQuery: mocks.withQuery,
              withSystemTransaction: mocks.withSystemTransaction,
              isLegacyDevelopmentConnection: true,
            },
            services: { identity: { syncUser: mocks.syncUser } },
          },
          "user_admin",
        ),
      };
    } catch (error) {
      return { success: false, error };
    }
  },
}));

import {
  cancelGovernanceAction,
  decideGovernanceAction,
  findVerifiedOfficialAction,
  getAdminSetupAction,
  requestGovernanceAction,
} from "@/server/actions/admin.actions";

const authorityId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (callback) =>
    callback({}, mocks),
  );
  mocks.requestGovernance.mockResolvedValue({
    id: requestId,
    status: "pending",
  });
});

describe("Governed authority administration", () => {
  it("validates and preserves the department payload through the transaction gateway", async () => {
    const result = await requestGovernanceAction({
      authorityId,
      requestId,
      action: "department_create",
      payload: {
        code: "PWD",
        name: " Public Works ",
        manager: "user_manager",
        manager_role: "department_manager",
      },
      reason: " Establish district department ",
    });
    expect(result.success).toBe(true);
    expect(mocks.requestGovernance).toHaveBeenCalledWith({
      authorityId,
      requestId,
      action: "department_create",
      payload: {
        code: "PWD",
        name: "Public Works",
        manager: "user_manager",
        manager_role: "department_manager",
      },
      reason: "Establish district department",
    });
  });

  it("rejects unsupported payload keys rather than allowing client-controlled governance data", async () => {
    const input = {
      authorityId,
      requestId,
      action: "role_create" as const,
      payload: {
        code: "manager",
        name: "Manager",
        scope: "authority" as const,
        permissions: ["authority_admin"],
        approved_by: "user_self",
      },
      reason: "Add role",
    };
    expect((await requestGovernanceAction(input)).success).toBe(false);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("requires a version for role edits and a nonblank decision reason", async () => {
    const input = {
      authorityId,
      action: "role_edit" as const,
      payload: { code: "manager", permissions: ["authority_admin"] },
      reason: "Revise permissions",
    };
    // Simulate an untyped network caller that omitted the concurrency token.
    expect(
      (
        await requestGovernanceAction(
          input as Parameters<typeof requestGovernanceAction>[0],
        )
      ).success,
    ).toBe(false);
    expect(
      (
        await decideGovernanceAction({
          id: requestId,
          approve: true,
          reason: " ",
        })
      ).success,
    ).toBe(false);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("routes decisions and cancellation through protected SQL transactions", async () => {
    await decideGovernanceAction({
      id: requestId,
      approve: false,
      reason: "Scope needs correction",
    });
    expect(mocks.decideGovernance).toHaveBeenCalledWith({
      id: requestId,
      approve: false,
      reason: "Scope needs correction",
    });
    expect(
      (
        await cancelGovernanceAction({
          id: requestId,
          reason: "Withdraw proposal",
        })
      ).success,
    ).toBe(true);
    expect(mocks.cancelGovernance).toHaveBeenCalledWith({
      id: requestId,
      reason: "Withdraw proposal",
    });
  });
});

describe("Authority user directory", () => {
  it("includes disabled and unverified users while retaining eligibility and scope restrictions", async () => {
    const users = [
      {
        clerkId: "user_admin",
        email: "admin@example.test",
        displayName: "Admin",
        emailVerified: true,
        disabledAt: null,
        createdAt: new Date(),
        locale: "en",
      },
      {
        clerkId: "user_disabled",
        email: "disabled@example.test",
        displayName: "Disabled",
        emailVerified: true,
        disabledAt: new Date(),
        createdAt: new Date(),
        locale: "hi",
      },
      {
        clerkId: "user_unverified",
        email: "unverified@example.test",
        displayName: "Unverified",
        emailVerified: false,
        disabledAt: null,
        createdAt: new Date(),
        locale: "en",
      },
    ];
    let identityWhere: SQL | undefined;
    const tx = {
      select: vi.fn(() => {
        let tableName = "";
        const query = {
          from(table: Parameters<typeof getTableName>[0]) {
            tableName = getTableName(table);
            return query;
          },
          where(clause: SQL) {
            if (tableName === "identities") identityWhere = clause;
            return query;
          },
          orderBy() {
            return query;
          },
          getSQL() {
            return sql`SELECT 1`;
          },
          async limit() {
            if (tableName === "authorities")
              return [
                {
                  id: authorityId,
                  code: "AUTH",
                  name: "Authority",
                  canAdmin: true,
                  canApprove: true,
                },
              ];
            if (tableName === "identities") return users;
            return [];
          },
        };
        return query;
      }),
    };
    mocks.withQuery.mockImplementation(async (callback) => callback(tx));
    const result = await getAdminSetupAction(authorityId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.users.map((user) => user.clerkId)).toEqual([
      "user_admin",
      "user_disabled",
      "user_unverified",
    ]);
    expect(result.data.eligibleIdentities.map((user) => user.clerkId)).toEqual([
      "user_admin",
    ]);
    expect(mocks.withQuery).toHaveBeenCalledOnce();
    expect(identityWhere).toBeDefined();
    if (!identityWhere) return;
    const predicate = new PgDialect().sqlToQuery(identityWhere);
    expect(predicate.sql).not.toContain("email_verified");
    expect(predicate.sql).not.toContain("disabled_at");
    expect(predicate.sql).toContain("exists");
    expect(predicate.params).toContain("user_admin");
  });
});

describe("Targeted verified official onboarding", () => {
  const updatedAt = Date.parse("2026-09-20T10:00:00Z");
  const user = () => ({
    id: "user_found",
    firstName: "Found",
    lastName: "Official",
    banned: false,
    locked: false,
    updatedAt,
    locale: "en",
    primaryEmailAddressId: "email_primary",
    emailAddresses: [
      {
        id: "email_primary",
        emailAddress: "official@example.test",
        verification: { status: "verified" },
      },
    ],
  });
  beforeEach(() => {
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ allowed: true }]),
    };
    mocks.withQuery.mockImplementation(async (callback) =>
      callback({ select: vi.fn().mockReturnValue(query) }),
    );
    mocks.clerkClient.mockResolvedValue({
      users: { getUserList: mocks.getUserList },
    });
    mocks.getUserList.mockResolvedValue({ totalCount: 1, data: [user()] });
    mocks.withSystemTransaction.mockImplementation(async (callback) =>
      callback({
        execute: vi
          .fn()
          .mockResolvedValue([
            { deprovisioned: false, disabled: false, verified: true },
          ]),
      }),
    );
  });

  it("denies authority access before any provider lookup or identity synchronization", async () => {
    mocks.withQuery.mockResolvedValue(false);
    expect(
      (
        await findVerifiedOfficialAction({
          authorityId,
          email: "official@example.test",
        })
      ).success,
    ).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.syncUser).not.toHaveBeenCalled();
    expect(mocks.withSystemTransaction).not.toHaveBeenCalled();
  });

  it.each([
    "unverified",
    "nonprimary",
    "banned",
    "locked",
    "missingTimestamp",
    "duplicate",
  ])("rejects %s provider accounts without syncing", async (kind) => {
    const record = user();
    if (kind === "unverified")
      record.emailAddresses[0].verification.status = "unverified";
    if (kind === "nonprimary") record.primaryEmailAddressId = "other";
    if (kind === "banned") record.banned = true;
    if (kind === "locked") record.locked = true;
    if (kind === "missingTimestamp") record.updatedAt = Number.NaN;
    mocks.getUserList.mockResolvedValue({
      totalCount: kind === "duplicate" ? 2 : 1,
      data: kind === "duplicate" ? [record, record] : [record],
    });
    expect(
      (
        await findVerifiedOfficialAction({
          authorityId,
          email: "official@example.test",
        })
      ).success,
    ).toBe(false);
    expect(mocks.syncUser).not.toHaveBeenCalled();
  });

  it("rejects deprovisioned identities even when Clerk still returns an enabled account", async () => {
    mocks.withSystemTransaction.mockImplementation(async (callback) =>
      callback({
        execute: vi
          .fn()
          .mockResolvedValue([
            { deprovisioned: true, disabled: false, verified: false },
          ]),
      }),
    );
    expect(
      (
        await findVerifiedOfficialAction({
          authorityId,
          email: "official@example.test",
        })
      ).success,
    ).toBe(false);
    expect(mocks.syncUser).not.toHaveBeenCalled();
  });

  it("reconciles exact verified primary email using the real provider timestamp without granting memberships", async () => {
    const localizedUser = user();
    localizedUser.locale = "hi-IN";
    mocks.getUserList.mockResolvedValue({
      totalCount: 1,
      data: [localizedUser],
    });
    const result = await findVerifiedOfficialAction({
      authorityId,
      email: "official@example.test",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      clerkId: "user_found",
      email: "official@example.test",
      displayName: "Found Official",
    });
    expect(mocks.getUserList).toHaveBeenCalledWith({
      emailAddress: ["official@example.test"],
      limit: 2,
    });
    expect(mocks.syncUser).toHaveBeenCalledWith({
      clerkId: "user_found",
      email: "official@example.test",
      name: "Found Official",
      verified: true,
      sourceUpdatedAt: new Date(updatedAt),
      locale: "hi",
    });
    expect(mocks.requestGovernance).not.toHaveBeenCalled();
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
});
