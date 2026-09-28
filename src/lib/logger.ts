/** Server diagnostics: never log domain payloads, credentials or raw exceptions. */
export type LogLevel = "debug" | "info" | "warn" | "error";
const privateKey =
  /secret|password|token|cookie|authorization|email|narrative|object.?key|payload|database.?url|dsn|connection.?string/i;
const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
function cleanString(value: string) {
  let text = value
    .slice(0, 1000)
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk)_(?:test|live)_[a-z\d_-]+/gi, "[REDACTED]")
    .replace(/[A-Z\d._%+-]+@[A-Z\d.-]+\.[A-Z]{2,}/gi, "[REDACTED]");
  for (const [key, secret] of Object.entries(process.env))
    if (
      !key.startsWith("NEXT_PUBLIC_") &&
      privateKey.test(key) &&
      secret &&
      secret.length >= 8
    )
      text = text.split(secret).join("[REDACTED]");
  return text;
}
export function redactLogFields(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || value === undefined || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return cleanString(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { errorType: cleanString(value.name) };
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactLogFields(item, depth + 1));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          privateKey.test(key)
            ? "[REDACTED]"
            : redactLogFields(item, depth + 1),
        ]),
    );
  return "[UNSUPPORTED]";
}
export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const threshold = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  if (levels[level] < (levels[threshold] ?? levels.info)) return;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: cleanString(event),
    release:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) ??
      process.env.APP_RELEASE ??
      "local",
    fields: redactLogFields(fields),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
export function reportError(
  error: unknown,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const record =
    error !== null && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const frames =
    error instanceof Error
      ? error.stack
          ?.split("\n")
          .slice(1, 7)
          .map((frame) => cleanString(frame.trim()))
      : undefined;
  logEvent("error", event, {
    ...fields,
    errorType: error instanceof Error ? error.name : "UnknownError",
    errorCode: typeof record.code === "string" ? record.code : undefined,
    digest: typeof record.digest === "string" ? record.digest : undefined,
    frames,
  });
}
export function validRequestId(value: unknown): string {
  return typeof value === "string" &&
    /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
      value,
    )
    ? value
    : crypto.randomUUID();
}
