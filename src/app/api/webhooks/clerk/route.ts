import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/logger";
import { RequestBodyError, readRequestBody } from "@/lib/request-body";
import { DomainError } from "@/server/db/error-mapper";
import { DatabaseSession } from "@/server/db/session";
import { IdentityService } from "@/server/services/identity.service";
import { createInvitationAcceptanceService } from "@/server/services/invitation-acceptance.service";

export async function POST(req: NextRequest) {
  const webhookSecret =
    process.env.CLERK_WEBHOOK_SIGNING_SECRET ??
    process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { success: false, error: "Clerk webhook verification is not configured" },
      { status: 503 },
    );
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    const body = await readRequestBody(req);
    const verifiedRequest = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body,
    });
    event = await verifyWebhook(verifiedRequest, {
      signingSecret: webhookSecret,
    });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    return NextResponse.json(
      { success: false, error: "Invalid webhook signature or payload" },
      { status: 400 },
    );
  }

  const session = DatabaseSession.system();
  const identityService = new IdentityService(session);

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const emailObj = event.data.email_addresses.find(
          (address) => address.id === event.data.primary_email_address_id,
        );
        const email = emailObj?.email_address;
        if (!email) {
          return NextResponse.json(
            { error: "No email address found" },
            { status: 400 },
          );
        }

        const name = [event.data.first_name, event.data.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();

        const verified = emailObj.verification?.status === "verified";
        const sourceUpdatedAt = new Date(event.data.updated_at);
        if (!Number.isFinite(sourceUpdatedAt.getTime())) {
          return NextResponse.json(
            { success: false, error: "Missing provider update timestamp" },
            { status: 400 },
          );
        }

        await identityService.syncUser({
          clerkId: event.data.id,
          email,
          name: name.length > 0 ? name : "Public Official",
          verified,
          sourceUpdatedAt,
        });

        const invitationId = event.data.public_metadata?.praviInvitationId;
        if (typeof invitationId === "string") {
          if (!verified || event.data.banned || event.data.locked)
            return NextResponse.json(
              {
                success: false,
                error: "Verified enabled invitation recipient required",
              },
              { status: 400 },
            );
          const acceptance = await createInvitationAcceptanceService(session);
          await acceptance.accept({
            invitationId,
            clerkId: event.data.id,
            email,
          });
          return NextResponse.json({
            status: "synced_and_invitation_accepted",
          });
        }
        return NextResponse.json({ status: "synced" });
      }

      case "user.deleted": {
        if (!event.data.id) {
          return NextResponse.json(
            { success: false, error: "Missing user identifier" },
            { status: 400 },
          );
        }
        // Deletion payloads have no updated_at; this timestamp is authenticated
        // by Svix and preserves the existing disable-user service contract.
        const sourceUpdatedAt = new Date(
          Number(req.headers.get("svix-timestamp")) * 1000,
        );
        await identityService.disableUser(event.data.id, sourceUpdatedAt);
        return NextResponse.json({ status: "disabled" });
      }

      default:
        return NextResponse.json({ status: "ignored" });
    }
  } catch (error) {
    logEvent("error", "clerk.webhook_reconciliation_failed", {
      eventType: event.type,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Identity or invitation reconciliation could not complete",
      },
      {
        status:
          error instanceof DomainError && error.statusCode < 500 ? 400 : 503,
      },
    );
  }
}
