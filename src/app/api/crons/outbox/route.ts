import { NextResponse } from "next/server";
import { logEvent } from "@/lib/logger";
import { verifyQStashSignature } from "@/lib/qstash";
import { RequestBodyError, readRequestBody } from "@/lib/request-body";
import { DatabaseSession } from "@/server/db/session";
import { createInvitationOutboxService } from "@/server/services/invitation-outbox.service";

export const maxDuration = 60;
export async function POST(req: Request) {
  let rawBody: string;
  try {
    rawBody = await readRequestBody(req);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid worker request body" },
      { status: error instanceof RequestBodyError ? error.statusCode : 400 },
    );
  }
  if (!(await verifyQStashSignature(req, rawBody)))
    return NextResponse.json(
      { success: false, error: "Invalid QStash signature" },
      { status: 401 },
    );
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl || !process.env.CLERK_SECRET_KEY)
      return NextResponse.json(
        {
          success: false,
          error: "Invitation dispatcher configuration is incomplete",
        },
        { status: 503 },
      );
    const worker = await createInvitationOutboxService(
      DatabaseSession.system(),
      appUrl,
    );
    const result = await worker.dispatch();
    return NextResponse.json(
      { success: result.retrying === 0, ...result },
      { status: result.retrying > 0 ? 503 : 200 },
    );
  } catch {
    logEvent("error", "outbox.dispatch_unavailable", { status: 503 });
    return NextResponse.json(
      {
        success: false,
        error:
          "Invitation dispatcher unavailable; verify worker credentials and migration",
      },
      { status: 503 },
    );
  }
}
