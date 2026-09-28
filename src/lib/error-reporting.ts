import { logEvent, redactLogFields, reportError } from "@/lib/logger";

/** Optional HTTPS collector, configured by the operator; never sends domain data. */
export async function captureError(
  error: unknown,
  event: string,
  fields: Record<string, unknown> = {},
) {
  reportError(error, event, fields);
  const configured = process.env.ERROR_REPORTING_URL;
  if (!configured) return;
  try {
    const destination = new URL(configured);
    if (
      destination.protocol !== "https:" ||
      destination.username ||
      destination.password ||
      destination.hash ||
      destination.search
    )
      throw new Error("Invalid telemetry destination");
    const token = process.env.ERROR_REPORTING_TOKEN;
    if (!token) throw new Error("Telemetry credential missing");
    const errorRecord =
      error !== null && typeof error === "object"
        ? (error as Record<string, unknown>)
        : {};
    const response = await fetch(destination, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        release:
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.APP_RELEASE ??
          "local",
        errorType: error instanceof Error ? error.name : "UnknownError",
        code:
          typeof errorRecord.code === "string" ? errorRecord.code : undefined,
        fields: redactLogFields(fields),
      }),
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Telemetry collector unavailable");
  } catch {
    logEvent("warn", "error_collector_unavailable", { event });
  }
}
