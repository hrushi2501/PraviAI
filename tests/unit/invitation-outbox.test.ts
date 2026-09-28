import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "@/server/db/session";
import {
  InvitationOutboxService,
  type InvitationProvider,
  type OutboxClaim,
  reconcileProviderInvitation,
} from "@/server/services/invitation-outbox.service";

const claim: OutboxClaim = {
  eventId: "00000000-0000-4000-8000-000000000001",
  invitationId: "00000000-0000-4000-8000-000000000002",
  email: "official@example.test",
  expiresAt: "2030-01-02T00:00:00Z",
  providerId: null,
  cancel: false,
};
const invitation = {
  id: "inv_provider_confirmed",
  emailAddress: claim.email,
  publicMetadata: { praviInvitationId: claim.invitationId },
  status: "pending",
};
function setup() {
  const provider = {
    getInvitationList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
    createInvitation: vi.fn().mockResolvedValue(invitation),
    revokeInvitation: vi
      .fn()
      .mockResolvedValue({ ...invitation, status: "revoked" }),
  };
  return provider;
}

describe("Retry-safe Clerk invitation delivery", () => {
  it("creates a real provider invitation with immutable recovery metadata", async () => {
    const provider = setup();
    expect(
      await reconcileProviderInvitation(
        provider,
        claim,
        "https://app.example.test",
        Date.parse("2030-01-01T00:00:00Z"),
      ),
    ).toEqual({ providerId: invitation.id });
    expect(provider.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: claim.email,
        ignoreExisting: false,
        notify: true,
        publicMetadata: { praviInvitationId: claim.invitationId },
        redirectUrl: "https://app.example.test/sign-up",
      }),
    );
  });
  it("recovers an invitation created before a database rollback without sending twice", async () => {
    const provider = setup();
    provider.getInvitationList.mockResolvedValue({
      data: [invitation],
      totalCount: 1,
    });
    expect(
      await reconcileProviderInvitation(
        provider,
        claim,
        "https://app.example.test",
      ),
    ).toEqual({ providerId: invitation.id });
    expect(provider.createInvitation).not.toHaveBeenCalled();
  });
  it("revokes cancelled/expired recovered invitations and never creates a replacement", async () => {
    const provider = setup();
    provider.getInvitationList.mockResolvedValue({
      data: [invitation],
      totalCount: 1,
    });
    await reconcileProviderInvitation(
      provider,
      { ...claim, cancel: true },
      "https://app.example.test",
    );
    expect(provider.revokeInvitation).toHaveBeenCalledWith(invitation.id);
    expect(provider.createInvitation).not.toHaveBeenCalled();
  });
  it("does not revoke an already revoked provider invitation on retry", async () => {
    const provider = setup();
    provider.getInvitationList.mockResolvedValue({
      data: [{ ...invitation, status: "revoked" }],
      totalCount: 1,
    });
    await reconcileProviderInvitation(
      provider,
      { ...claim, cancel: true },
      "https://app.example.test",
    );
    expect(provider.revokeInvitation).not.toHaveBeenCalled();
    expect(provider.createInvitation).not.toHaveBeenCalled();
  });
  it("fails closed on ambiguous recovery, mismatched responses, and over-limit lookup", async () => {
    const provider = setup();
    provider.getInvitationList.mockResolvedValue({
      data: [invitation, { ...invitation, id: "inv_duplicate" }],
      totalCount: 2,
    });
    await expect(
      reconcileProviderInvitation(provider, claim, "https://app.example.test"),
    ).rejects.toThrow("AMBIGUOUS");
    expect(provider.createInvitation).not.toHaveBeenCalled();
    provider.getInvitationList.mockResolvedValue({ data: [], totalCount: 301 });
    await expect(
      reconcileProviderInvitation(provider, claim, "https://app.example.test"),
    ).rejects.toThrow("RECOVERY_LIMIT");
    provider.getInvitationList.mockResolvedValue({ data: [], totalCount: 0 });
    provider.createInvitation.mockResolvedValue({
      ...invitation,
      emailAddress: "other@example.test",
    });
    await expect(
      reconcileProviderInvitation(
        provider,
        claim,
        "https://app.example.test",
        Date.parse("2030-01-01T00:00:00Z"),
      ),
    ).rejects.toThrow("MISMATCH");
  });
  it("records redacted failures under a claimed transaction and bounds batches", async () => {
    const provider = setup();
    provider.getInvitationList.mockRejectedValue(
      new Error("secret email or token"),
    );
    let claims = 0;
    const execute = vi.fn(async (query) => {
      const sql = new PgDialect().sqlToQuery(query);
      if (sql.sql.includes("claim_invitation_outbox"))
        return [{ claim: claims++ === 0 ? claim : null }];
      return [];
    });
    const session = {
      withSystemTransaction: vi.fn(async (callback) => callback({ execute })),
    } as unknown as DatabaseSession;
    const worker = new InvitationOutboxService(
      session,
      provider as InvitationProvider,
      "https://app.example.test",
    );
    expect(await worker.dispatch()).toEqual({
      processed: 1,
      delivered: 0,
      cancelled: 0,
      retrying: 1,
    });
    const failure = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
    expect(failure.sql).toContain("record_outbox_failure");
    expect(failure.params).toEqual([claim.eventId]);
    expect(failure.sql).not.toContain("secret");
    await expect(worker.dispatch(100)).rejects.toThrow("batch size");
  });
});
