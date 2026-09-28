import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { captureError } from "@/lib/error-reporting";
import { validRequestId } from "@/lib/logger";
import { enforceActorRateLimit, RateLimitError } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";
import { DomainError } from "@/server/db/error-mapper";
import { createDomainContainer } from "@/server/services/service-factory";

export const maxDuration = 15;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = validRequestId(request.headers.get("x-pravi-request-id"));
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await enforceActorRateLimit(userId, "evidence-downloads", 30, 60_000);
    const id = z.uuid().parse((await params).id);
    const token = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("ticket"));
    if (!redis)
      throw new DomainError(
        "Protected evidence delivery is unavailable.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    const ticket = await redis.get<{
      actorId: string;
      evidenceId: string;
      signedUrl: string;
    }>(`pravi:evidence-ticket:${token}`);
    if (!ticket || ticket.actorId !== userId || ticket.evidenceId !== id)
      return NextResponse.json(
        { error: "Download authorization expired or is unavailable" },
        { status: 403 },
      );
    // Recheck current membership/record privacy before delivering bytes, even during ticket TTL.
    await createDomainContainer(userId).services.evidence.requestAuditedAccess({
      evidenceId: id,
      purpose: "Download previously authorized evidence",
    });
    const upstream = new URL(ticket.signedUrl);
    if (
      upstream.origin !==
        new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin ||
      !upstream.pathname.startsWith("/storage/v1/object/sign/")
    )
      throw new DomainError(
        "Protected evidence reference is invalid.",
        "INVALID_STORAGE_REFERENCE",
        503,
      );
    const response = await fetch(upstream, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || !response.body)
      throw new DomainError(
        "Protected evidence could not be downloaded.",
        "STORAGE_UNAVAILABLE",
        503,
      );
    return new Response(response.body, {
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "x-pravi-request-id": requestId,
      },
    });
  } catch (error) {
    const expected =
      error instanceof DomainError || error instanceof RateLimitError;
    const status = expected
      ? error.statusCode
      : error instanceof z.ZodError
        ? 400
        : 500;
    if (status >= 500)
      await captureError(error, "evidence_download_failed", { requestId });
    return NextResponse.json(
      {
        error: expected ? error.message : "Evidence download is unavailable.",
        requestId,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
