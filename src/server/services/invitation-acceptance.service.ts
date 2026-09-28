import { clerkClient } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { invitations } from "@/db/schema/governance";
import { DomainError, InvariantViolationError } from "../db/error-mapper";
import type { DatabaseSession } from "../db/session";

export interface AcceptedInvitationProvider {
  getInvitationList(params: {
    query: string;
    status: "accepted";
    limit: number;
    offset: number;
  }): Promise<{
    data: Array<{
      id: string;
      emailAddress: string;
      status: string;
      publicMetadata: Record<string, unknown> | null;
    }>;
    totalCount: number;
  }>;
}
export class InvitationAcceptanceService {
  constructor(
    private readonly session: DatabaseSession,
    private readonly provider: AcceptedInvitationProvider,
  ) {}
  async accept(input: {
    invitationId: string;
    clerkId: string;
    email: string;
  }) {
    const params = z
      .strictObject({
        invitationId: z.string().uuid(),
        clerkId: z.string().regex(/^user_[A-Za-z0-9_]+$/),
        email: z.email().toLowerCase(),
      })
      .parse(input);
    const invitation = await this.session.withSystemTransaction(async (tx) => {
      const [row] = await tx
        .select({
          id: invitations.id,
          email: invitations.email,
          status: invitations.status,
          providerId: invitations.clerkInvitationId,
          acceptedBy: invitations.acceptedBy,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(eq(invitations.id, params.invitationId))
        .limit(1);
      return row;
    });
    if (!invitation || invitation.email !== params.email)
      throw new InvariantViolationError(
        "Invitation recipient binding is invalid",
      );
    if (invitation.status === "pending")
      throw new DomainError(
        "Invitation delivery has not been committed",
        "INVITATION_PENDING_DELIVERY",
        503,
      );
    if (
      !invitation.providerId ||
      !["sent", "accepted"].includes(invitation.status)
    )
      throw new InvariantViolationError(
        "Invitation is closed or missing provider binding",
      );
    if (
      invitation.status === "accepted" &&
      invitation.acceptedBy !== params.clerkId
    )
      throw new InvariantViolationError(
        "Invitation has already been accepted by another identity",
      );
    const response = await this.provider.getInvitationList({
      query: params.email,
      status: "accepted",
      limit: 100,
      offset: 0,
    });
    if (response.totalCount > 100)
      throw new DomainError(
        "Invitation verification requires manual review",
        "INVITATION_LOOKUP_LIMIT",
        503,
      );
    const matches = response.data.filter(
      (row) =>
        row.id === invitation.providerId &&
        row.status === "accepted" &&
        row.emailAddress.trim().toLowerCase() === params.email &&
        row.publicMetadata?.praviInvitationId === params.invitationId,
    );
    if (matches.length !== 1)
      throw new InvariantViolationError(
        "Accepted provider invitation binding is invalid",
      );
    // The SQL command rechecks verified identity, expiry, provider binding, scope,
    // current inviter permissions and role eligibility while holding the row lock.
    await this.session.withSystemTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT asset_manager.accept_invitation(${params.invitationId}::uuid,${invitation.providerId},${params.clerkId})`,
      );
    });
    return { accepted: true };
  }
}
export async function createInvitationAcceptanceService(
  session: DatabaseSession,
) {
  const client = await clerkClient();
  return new InvitationAcceptanceService(session, client.invitations);
}
