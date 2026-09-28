import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession } from "@/server/db/session";
import { IdentityService } from "@/server/services/identity.service";

function setup(rows: { sourceUpdatedAt: Date }[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  const session = {
    client: { select: vi.fn().mockReturnValue(chain) },
    withQuery: vi.fn().mockResolvedValue([]),
  };
  const service = new IdentityService(session as unknown as DatabaseSession);
  const sync = vi.spyOn(service, "syncUser").mockResolvedValue();
  return { service, sync, session };
}

describe("trusted identity reconciliation", () => {
  it("provisions a new identity using the provider's verification and timestamp", async () => {
    const { service, sync } = setup([]);
    const updated = new Date("2026-09-28T10:00:00Z");
    await service.ensureActor("user_google", {
      email: "user@example.com",
      verified: true,
      sourceUpdatedAt: updated,
    });
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkId: "user_google",
        verified: true,
        sourceUpdatedAt: updated,
      }),
    );
  });
  it("forwards an older provider timestamp unchanged so SQL preserves newer identity state", async () => {
    const { service, sync, session } = setup([
      { sourceUpdatedAt: new Date("2026-09-28T11:00:00Z") },
    ]);
    await service.ensureActor("user_google", {
      email: "user@example.com",
      verified: true,
      sourceUpdatedAt: new Date("2026-09-28T10:00:00Z"),
    });
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUpdatedAt: new Date("2026-09-28T10:00:00Z"),
      }),
    );
    expect(session.client.select).not.toHaveBeenCalled();
  });
  it("preserves an unverified provider state rather than assuming verification", async () => {
    const { service, sync } = setup([]);
    await service.ensureActor("user_unverified", {
      email: "user@example.com",
      sourceUpdatedAt: new Date("2026-09-28T10:00:00Z"),
    });
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ verified: false }),
    );
  });
});
