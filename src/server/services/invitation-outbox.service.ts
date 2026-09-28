import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { logEvent } from "@/lib/logger";
import type { DatabaseSession } from "../db/session";

export interface OutboxClaim {
  eventId: string;
  invitationId: string;
  email: string;
  expiresAt: string;
  providerId: string | null;
  cancel: boolean;
}
interface ProviderInvitation {
  id: string;
  emailAddress: string;
  publicMetadata: Record<string, unknown> | null;
  status: string;
}
export interface InvitationProvider {
  getInvitationList(params: {
    query: string;
    limit: number;
    offset: number;
    status?: "revoked";
  }): Promise<{ data: ProviderInvitation[]; totalCount: number }>;
  createInvitation(params: {
    emailAddress: string;
    expiresInDays: number;
    ignoreExisting: false;
    notify: true;
    publicMetadata: Record<string, unknown>;
    redirectUrl: string;
  }): Promise<ProviderInvitation>;
  revokeInvitation(id: string): Promise<ProviderInvitation>;
}

/** Recovery uses immutable metadata; no provider identifiers are fabricated. */
export async function reconcileProviderInvitation(
  provider: InvitationProvider,
  claim: OutboxClaim,
  appUrl: string,
  now = Date.now(),
) {
  const matches: ProviderInvitation[] = [];
  for (const status of [undefined, "revoked"] as const) {
    for (let page = 0; page < 3; page++) {
      const response = await provider.getInvitationList({
        query: claim.email,
        limit: 100,
        offset: page * 100,
        ...(status ? { status } : {}),
      });
      if (response.totalCount > 300)
        throw new Error("INVITATION_RECOVERY_LIMIT");
      for (const invitation of response.data) {
        if (
          invitation.emailAddress.trim().toLowerCase() ===
            claim.email.trim().toLowerCase() &&
          invitation.publicMetadata?.praviInvitationId === claim.invitationId &&
          !matches.some((row) => row.id === invitation.id)
        )
          matches.push(invitation);
      }
      if ((page + 1) * 100 >= response.totalCount) break;
    }
  }
  if (matches.length > 1) throw new Error("AMBIGUOUS_PROVIDER_INVITATION");
  const existing = matches[0];
  if (claim.providerId && existing && claim.providerId !== existing.id)
    throw new Error("PROVIDER_BINDING_MISMATCH");
  if (claim.cancel) {
    const id = claim.providerId ?? existing?.id;
    if (id && existing?.status !== "revoked" && existing?.status !== "accepted")
      await provider.revokeInvitation(id);
    return { cancelled: true as const };
  }
  if (existing) {
    if (!["pending", "accepted"].includes(existing.status))
      throw new Error("PROVIDER_INVITATION_CLOSED");
    return { providerId: existing.id };
  }
  if (claim.providerId) throw new Error("PROVIDER_INVITATION_NOT_FOUND");
  const expiry = Date.parse(claim.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now)
    throw new Error("INVITATION_EXPIRED");
  const redirect = new URL("/sign-up", appUrl);
  if (
    redirect.protocol !== "https:" &&
    !(
      redirect.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(redirect.hostname)
    )
  )
    throw new Error("INVALID_INVITATION_REDIRECT");
  const invitation = await provider.createInvitation({
    emailAddress: claim.email,
    expiresInDays: Math.max(
      1,
      Math.min(30, Math.ceil((expiry - now) / 86400000)),
    ),
    ignoreExisting: false,
    notify: true,
    publicMetadata: { praviInvitationId: claim.invitationId },
    redirectUrl: redirect.toString(),
  });
  if (
    !invitation.id ||
    invitation.status !== "pending" ||
    invitation.emailAddress.trim().toLowerCase() !==
      claim.email.trim().toLowerCase() ||
    invitation.publicMetadata?.praviInvitationId !== claim.invitationId
  )
    throw new Error("PROVIDER_RESPONSE_MISMATCH");
  return { providerId: invitation.id };
}

export class InvitationOutboxService {
  constructor(
    private readonly session: DatabaseSession,
    private readonly provider: InvitationProvider,
    private readonly appUrl: string,
  ) {}
  async dispatch(batchSize = 5) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5)
      throw new Error("Invalid outbox batch size");
    const result = { delivered: 0, cancelled: 0, retrying: 0, processed: 0 };
    for (let index = 0; index < batchSize; index++) {
      const state = await this.session.withSystemTransaction(async (tx) => {
        const rows = await tx.execute(
          sql`SELECT asset_manager.claim_invitation_outbox() AS claim`,
        );
        const claim = (
          rows as unknown as Array<{ claim: OutboxClaim | null }>
        )[0]?.claim;
        if (!claim) return "empty" as const;
        let outcome: Awaited<ReturnType<typeof reconcileProviderInvitation>>;
        try {
          outcome = await reconcileProviderInvitation(
            this.provider,
            claim,
            this.appUrl,
          );
        } catch {
          logEvent("warn", "outbox.provider_retry", { eventId: claim.eventId });
          // Provider errors can contain emails/tokens; persist only a bounded safe code.
          await tx.execute(
            sql`SELECT asset_manager.record_outbox_failure(${claim.eventId}::uuid, 'INVITATION_PROVIDER_FAILURE')`,
          );
          return "retrying" as const;
        }
        if ("cancelled" in outcome) {
          await tx.execute(
            sql`SELECT asset_manager.complete_invitation_revocation(${claim.eventId}::uuid)`,
          );
          return "cancelled" as const;
        }
        await tx.execute(
          sql`SELECT asset_manager.invitation_delivered(${claim.invitationId}::uuid,${outcome.providerId})`,
        );
        return "delivered" as const;
      });
      if (state === "empty") break;
      result[state]++;
      result.processed++;
    }
    logEvent("info", "outbox.batch_complete", result);
    return result;
  }
}

export async function createInvitationOutboxService(
  session: DatabaseSession,
  appUrl: string,
) {
  const client = await clerkClient();
  return new InvitationOutboxService(session, client.invitations, appUrl);
}
