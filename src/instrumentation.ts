import type { Instrumentation } from "next";
import { captureError } from "@/lib/error-reporting";
import { logEvent, validRequestId } from "@/lib/logger";

export function register() {
  logEvent("info", "server_started", {
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
  });
}
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await captureError(error, "request_failed", {
    requestId: validRequestId(request.headers["x-pravi-request-id"]),
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
};
