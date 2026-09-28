import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "@/server/db/session";
import { InvitationAcceptanceService } from "@/server/services/invitation-acceptance.service";

const invitationId = "00000000-0000-4000-8000-000000000001";
const recipient = {
  invitationId,
  clerkId: "user_recipient",
  email: "recipient@example.test",
};
function setup(overrides = {}) {
  const row = {
    id: invitationId,
    email: recipient.email,
    status: "sent",
    providerId: "inv_confirmed",
    acceptedBy: null,
    expiresAt: new Date(Date.now() + 86400000),
    ...overrides,
  };
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
  };
  const execute = vi.fn().mockResolvedValue([]);
  const session = {
    withSystemTransaction: vi.fn(async (callback) =>
      callback({ select: () => chain, execute }),
    ),
  } as unknown as DatabaseSession;
  const provider = {
    getInvitationList: vi.fn().mockResolvedValue({
      totalCount: 1,
      data: [
        {
          id: "inv_confirmed",
          emailAddress: recipient.email,
          status: "accepted",
          publicMetadata: { praviInvitationId: invitationId },
        },
      ],
    }),
  };
  return {
    service: new InvitationAcceptanceService(session, provider),
    provider,
    execute,
  };
}
describe("Invitation recipient and provider binding", () => {
  it("calls canonical acceptance only after matching exact email, immutable invitation metadata and real provider ID", async () => {
    const { service, provider, execute } = setup();
    expect(await service.accept(recipient)).toEqual({ accepted: true });
    expect(provider.getInvitationList).toHaveBeenCalledWith({
      query: recipient.email,
      status: "accepted",
      limit: 100,
      offset: 0,
    });
    const call = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(call.sql).toContain("asset_manager.accept_invitation");
    expect(call.params).toEqual([
      invitationId,
      "inv_confirmed",
      "user_recipient",
    ]);
  });
  it.each([
    { email: "another@example.test" },
    { status: "revoked" },
    { status: "pending" },
    { status: "accepted", acceptedBy: "user_other" },
  ])("denies wrong recipient, closed, pending or conflicting acceptance before provider/grants", async (overrides) => {
    const { service, provider, execute } = setup(overrides);
    await expect(service.accept(recipient)).rejects.toThrow();
    expect(provider.getInvitationList).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not trust public metadata alone when provider ID differs", async () => {
    const { service, provider, execute } = setup();
    provider.getInvitationList.mockResolvedValue({
      totalCount: 1,
      data: [
        {
          id: "inv_different",
          emailAddress: recipient.email,
          status: "accepted",
          publicMetadata: { praviInvitationId: invitationId },
        },
      ],
    });
    await expect(service.accept(recipient)).rejects.toThrow("binding");
    expect(execute).not.toHaveBeenCalled();
  });
});
