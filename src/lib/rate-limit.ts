import { createHash } from "node:crypto";
import { logEvent } from "@/lib/logger";
import { redis } from "@/lib/redis";

export class RateLimitError extends Error {
  constructor(
    public readonly statusCode: 429 | 503,
    public readonly retryAfter: number,
  ) {
    super(
      statusCode === 429
        ? "Too many requests. Please try again shortly."
        : "Request protection is unavailable. Please try again shortly.",
    );
  }
}

const incrementWindow = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;
let warned = false;

export async function enforceActorRateLimit(
  actorId: string,
  namespace = "actions",
  limit = 120,
  windowMs = 60_000,
): Promise<void> {
  if (!redis) {
    if (process.env.NODE_ENV === "production")
      throw new RateLimitError(503, 30);
    if (!warned) {
      logEvent("warn", "rate_limit_development_bypass", { configured: false });
      warned = true;
    }
    return;
  }
  const digest = createHash("sha256").update(actorId).digest("hex");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      redis.eval<number[]>(
        incrementWindow,
        [`pravi:limit:${namespace}:${digest}`],
        [windowMs],
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RateLimitError(503, 30)), 2000);
      }),
    ]);
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      !result.every(Number.isFinite)
    )
      throw new RateLimitError(503, 30);
    if (result[0] > limit)
      throw new RateLimitError(429, Math.max(1, Math.ceil(result[1] / 1000)));
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    throw new RateLimitError(503, 30);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
