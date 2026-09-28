import { eq } from "drizzle-orm";
import { authorities, authorityMemberships } from "@/db/schema/identities";
import type { DatabaseSession } from "../db/session";

export interface SyncIdentityParams {
  clerkId: string;
  email: string;
  name: string;
  verified: boolean;
  sourceUpdatedAt: Date;
  locale?: string;
}

export class IdentityService {
  constructor(private readonly session: DatabaseSession) {}

  /**
   * Synchronizes identity from Clerk webhook events or on-demand reconciliation.
   */
  async syncUser(params: SyncIdentityParams): Promise<void> {
    await this.session.withSystemTransaction(async (_tx, procedures) => {
      await procedures.syncIdentity({
        clerkId: params.clerkId,
        email: params.email,
        name: params.name,
        verified: params.verified,
        sourceUpdatedAt: params.sourceUpdatedAt,
        locale: params.locale,
      });
    });
  }

  /**
   * Disables identity when a user is deleted or suspended in Clerk.
   */
  async disableUser(clerkId: string, sourceUpdatedAt: Date): Promise<void> {
    await this.session.withSystemTransaction(async (_tx, procedures) => {
      await procedures.disableIdentity({
        clerkId,
        sourceUpdatedAt,
      });
    });
  }

  /**
   * Ensures the current authenticated Clerk actor exists in the database.
   * If not found, reconciles the row immediately with their profile metadata.
   */
  async ensureActor(
    clerkId: string,
    profile?: {
      email?: string;
      name?: string;
      locale?: string;
      verified?: boolean;
      sourceUpdatedAt?: Date;
    },
  ) {
    if (profile?.email && profile.sourceUpdatedAt) {
      await this.syncUser({
        clerkId,
        email: profile.email,
        name: profile.name ?? "Public Official",
        verified: profile.verified === true,
        sourceUpdatedAt: profile.sourceUpdatedAt,
        locale: profile.locale ?? "en",
      });
    }

    const memberships = await this.session.withQuery(async (tx) =>
      tx
        .select({
          authorityId: authorityMemberships.authorityId,
          authorityName: authorities.name,
          active: authorityMemberships.active,
        })
        .from(authorityMemberships)
        .innerJoin(
          authorities,
          eq(authorityMemberships.authorityId, authorities.id),
        )
        .where(eq(authorityMemberships.clerkId, clerkId)),
    );

    return {
      clerkId,
      memberships,
    };
  }
}
