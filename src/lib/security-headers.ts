/** Static policy keeps Next/Clerk inline hydration compatible; it is not a nonce-based XSS policy. */
export function securityHeaders(production: boolean, publishableKey?: string) {
  const clerkOrigins = ["https://*.clerk.accounts.dev", "https://*.clerk.com"];
  if (publishableKey) {
    try {
      const hostname = Buffer.from(
        publishableKey.replace(/^pk_(test|live)_/, ""),
        "base64",
      )
        .toString()
        .replace(/\$$/, "");
      if (/^[a-z0-9.-]+$/i.test(hostname) && hostname.includes("."))
        clerkOrigins.push(`https://${hostname}`);
    } catch {
      /* Invalid keys are rejected by Clerk. */
    }
  }
  const clerk = [...new Set(clerkOrigins)].join(" ");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${production ? "" : "'unsafe-eval'"} ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${clerk} https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.protect.clerk.com https://challenges.cloudflare.com ${production ? "" : "ws://localhost:* ws://127.0.0.1:*"}`,
    `img-src 'self' data: blob: ${clerk} https://img.clerk.com https://images.clerkstage.dev https://res.cloudinary.com https://tile.openstreetmap.org https://images.unsplash.com`,
    "font-src 'self' data:",
    `frame-src 'self' ${clerk} https://challenges.cloudflare.com https://*.protect.clerk.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ]
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    { key: "Content-Security-Policy", value: policy },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
      : []),
  ];
}
