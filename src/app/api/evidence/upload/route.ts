import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { productionConfigurationIssues } from "@/lib/env";
import { captureError } from "@/lib/error-reporting";
import { MAX_EVIDENCE_BYTES } from "@/lib/evidence-file";
import { validRequestId } from "@/lib/logger";
import { enforceActorRateLimit, RateLimitError } from "@/lib/rate-limit";
import { RequestBodyError, readRequestBytes } from "@/lib/request-body";
import { DomainError } from "@/server/db/error-mapper";
import { createDomainContainer } from "@/server/services/service-factory";

export const maxDuration = 30;

export async function POST(request: Request) {
  const requestId = validRequestId(request.headers.get("x-pravi-request-id"));
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    // Browser mutations must originate on this application, never a sibling site.
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.NEXT_PUBLIC_APP_URL ?? request.url)
      .origin;
    let parsedOrigin: string | undefined;
    try {
      parsedOrigin = origin ? new URL(origin).origin : undefined;
    } catch {
      /* Invalid origins fail closed below. */
    }
    if (
      !parsedOrigin ||
      parsedOrigin !== expected ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return NextResponse.json(
        { success: false, error: "Invalid request origin" },
        { status: 403 },
      );
    if (productionConfigurationIssues().length)
      throw new DomainError(
        "Application services are unavailable.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    await enforceActorRateLimit(userId, "evidence-uploads", 10, 60_000);
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data;")
    )
      return NextResponse.json(
        { success: false, error: "Multipart file upload required" },
        { status: 415 },
      );
    const bytes = await readRequestBytes(request, MAX_EVIDENCE_BYTES + 65_536);
    let multipart: FormData;
    try {
      multipart = await new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: bytes,
      }).formData();
    } catch {
      throw new DomainError("Invalid multipart upload.", "INVALID_UPLOAD", 422);
    }
    const allowed = new Set([
      "file",
      "assetId",
      "inspectionId",
      "workOrderId",
      "requestId",
      "caption",
      "classification",
    ]);
    for (const key of multipart.keys())
      if (!allowed.has(key) || multipart.getAll(key).length !== 1)
        throw new DomainError(
          "Unsupported or repeated upload field.",
          "INVALID_UPLOAD",
          422,
        );
    const file = multipart.get("file");
    if (!(file instanceof File))
      throw new DomainError("Choose an evidence file.", "INVALID_UPLOAD", 422);
    const text = (key: string) => {
      const value = multipart.get(key);
      if (value !== null && typeof value !== "string")
        throw new DomainError(
          "Invalid upload metadata.",
          "INVALID_UPLOAD",
          422,
        );
      return value ?? undefined;
    };
    const classification = text("classification") ?? "internal";
    if (classification !== "internal" && classification !== "restricted")
      throw new DomainError(
        "Use internal or restricted evidence classification.",
        "INVALID_UPLOAD",
        422,
      );
    const data = await createDomainContainer(
      userId,
    ).services.evidence.uploadEvidence({
      assetId: text("assetId") ?? "",
      inspectionId: text("inspectionId"),
      workOrderId: text("workOrderId"),
      requestId: text("requestId") ?? "",
      caption: text("caption"),
      classification,
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          "Cache-Control": "no-store",
          "x-pravi-request-id": requestId,
        },
      },
    );
  } catch (error) {
    const domain = error instanceof DomainError;
    const body = error instanceof RequestBodyError;
    const rate = error instanceof RateLimitError;
    const validation = error instanceof ZodError;
    const status =
      domain || body || rate ? error.statusCode : validation ? 422 : 500;
    if (status >= 500)
      await captureError(error, "evidence_upload_failed", { requestId });
    return NextResponse.json(
      {
        success: false,
        error:
          domain || body || rate
            ? error.message
            : validation
              ? "Check the upload fields and try again."
              : "Evidence could not be uploaded. Retry or contact your administrator.",
        requestId,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(rate ? { "Retry-After": String(error.retryAfter) } : {}),
        },
      },
    );
  }
}
