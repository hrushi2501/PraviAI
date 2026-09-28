import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { productionConfigurationIssues } from "@/lib/env";
import { captureError } from "@/lib/error-reporting";
import { logEvent, validRequestId } from "@/lib/logger";
import { enforceActorRateLimit, RateLimitError } from "@/lib/rate-limit";
import { DomainError, ForbiddenError } from "../db/error-mapper";
import {
  type DomainContainer,
  ServiceFactory,
} from "../services/service-factory";

export type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      code: string;
      statusCode: number;
      requestId?: string;
      retryAfter?: number;
    };

export async function withAuthenticatedAction<T>(
  action: (container: DomainContainer, actorId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  const started = Date.now();
  let requestId: string = randomUUID();
  try {
    const incoming = await headers();
    requestId = validRequestId(incoming.get("x-pravi-request-id")) ?? requestId;
    const { userId } = await auth();
    if (!userId)
      throw new ForbiddenError(
        "Authentication required to perform this action",
      );
    if (productionConfigurationIssues().length)
      throw new DomainError(
        "Application services are unavailable. Please contact your administrator.",
        "SERVICE_UNAVAILABLE",
        503,
      );
    await enforceActorRateLimit(userId);
    const data = await action(ServiceFactory.forUser(userId), userId);
    logEvent("info", "action_completed", {
      requestId,
      durationMs: Date.now() - started,
    });
    return { success: true, data };
  } catch (error: unknown) {
    unstable_rethrow(error);
    const isDomain = error instanceof DomainError;
    const isValidation = error instanceof ZodError;
    const isRate = error instanceof RateLimitError;
    const statusCode =
      isDomain || isRate ? error.statusCode : isValidation ? 422 : 500;
    const code = isDomain
      ? error.code
      : isRate
        ? statusCode === 429
          ? "RATE_LIMITED"
          : "SERVICE_UNAVAILABLE"
        : isValidation
          ? "VALIDATION_ERROR"
          : "INTERNAL_ERROR";
    if (statusCode >= 500)
      await captureError(error, "action_failed", {
        requestId,
        code,
        durationMs: Date.now() - started,
      });
    else
      logEvent("warn", "action_rejected", {
        requestId,
        code,
        statusCode,
        durationMs: Date.now() - started,
      });
    return {
      success: false,
      error:
        isDomain && error.code === "CONFLICT"
          ? "This record conflicts with an existing record. Reload and try again."
          : isDomain || isRate
            ? error.message
            : isValidation
              ? "Check the submitted values and try again."
              : "The action could not be completed. Please try again or contact your administrator.",
      code,
      statusCode,
      requestId,
      ...(isRate ? { retryAfter: error.retryAfter } : {}),
    };
  }
}
