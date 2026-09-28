import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { system, syncUser, disableUser, accept, createAcceptance } = vi.hoisted(
  () => ({
    system: vi.fn(),
    syncUser: vi.fn(),
    disableUser: vi.fn(),
    accept: vi.fn(),
    createAcceptance: vi.fn(),
  }),
);
vi.mock("@/server/db/session", () => ({ DatabaseSession: { system } }));
vi.mock("@/server/services/identity.service", () => ({
  IdentityService: class {
    syncUser = syncUser;
    disableUser = disableUser;
  },
}));

vi.mock("@/server/services/invitation-acceptance.service", () => ({
  createInvitationAcceptanceService: createAcceptance,
}));

import { POST } from "@/app/api/webhooks/clerk/route";

const secret = `whsec_${Buffer.from("local-test-signing-secret").toString("base64")}`;
function request(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const id = "msg_test";
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new NextRequest("https://example.com/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  createAcceptance.mockResolvedValue({ accept });
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", secret);
  vi.stubEnv("CLERK_WEBHOOK_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Clerk webhook verification", () => {
  it("rejects missing signing configuration before accessing the database", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    const response = await POST(
      request('{"type":"user.deleted","data":{"id":"user_test"}}'),
    );
    expect(response.status).toBe(503);
    expect(system).not.toHaveBeenCalled();
  });

  it("rejects unsigned identity events", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/webhooks/clerk", {
        method: "POST",
        body: '{"type":"user.deleted","data":{"id":"user_test"}}',
      }),
    );
    expect(response.status).toBe(400);
    expect(system).not.toHaveBeenCalled();
  });

  it("rejects expired signatures", async () => {
    const response = await POST(
      request(
        '{"type":"user.deleted","data":{"id":"user_test"}}',
        Math.floor(Date.now() / 1000) - 600,
      ),
    );
    expect(response.status).toBe(400);
    expect(disableUser).not.toHaveBeenCalled();
  });

  it("syncs the verified primary email from an authenticated event", async () => {
    const updatedAt = Date.now();
    const response = await POST(
      request(
        JSON.stringify({
          type: "user.updated",
          data: {
            id: "user_test",
            updated_at: updatedAt,
            first_name: "Asha",
            last_name: "Patel",
            primary_email_address_id: "primary",
            email_addresses: [
              {
                id: "secondary",
                email_address: "other@example.com",
                verification: { status: "unverified" },
              },
              {
                id: "primary",
                email_address: "asha@example.com",
                verification: { status: "verified" },
              },
            ],
          },
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(syncUser).toHaveBeenCalledWith({
      clerkId: "user_test",
      email: "asha@example.com",
      name: "Asha Patel",
      verified: true,
      sourceUpdatedAt: new Date(updatedAt),
    });
  });
  it("binds a signed verified recipient event to invitation acceptance", async () => {
    const invitationId = "00000000-0000-4000-8000-000000000001";
    const response = await POST(
      request(
        JSON.stringify({
          type: "user.created",
          data: {
            id: "user_recipient",
            updated_at: Date.now(),
            first_name: "Recipient",
            last_name: null,
            primary_email_address_id: "primary",
            public_metadata: { praviInvitationId: invitationId },
            email_addresses: [
              {
                id: "primary",
                email_address: "recipient@example.test",
                verification: { status: "verified" },
              },
            ],
          },
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(accept).toHaveBeenCalledWith({
      invitationId,
      clerkId: "user_recipient",
      email: "recipient@example.test",
    });
  });
  it("rejects unverified invitation signup without granting membership", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          type: "user.created",
          data: {
            id: "user_recipient",
            updated_at: Date.now(),
            primary_email_address_id: "primary",
            public_metadata: {
              praviInvitationId: "00000000-0000-4000-8000-000000000001",
            },
            email_addresses: [
              {
                id: "primary",
                email_address: "recipient@example.test",
                verification: { status: "unverified" },
              },
            ],
          },
        }),
      ),
    );
    expect(response.status).toBe(400);
    expect(accept).not.toHaveBeenCalled();
  });
});
