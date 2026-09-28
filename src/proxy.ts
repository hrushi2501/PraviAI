import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { validRequestId } from "@/lib/logger";

/**
 * Next.js Proxy (Middleware)
 *
 * Integrates Clerk authentication session handling with Next.js.
 * Protection is handled resource-side (e.g. in layouts/routes using `await auth.protect()`).
 */
const withClerk = clerkMiddleware();
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  // Correlation IDs are server-generated; arbitrary client headers cannot enter logs.
  const requestId = validRequestId(undefined);
  const forwarded = new Headers(request.headers);
  forwarded.set("x-pravi-request-id", requestId);
  const publicProbe =
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname === "/api/ready";
  const response = publicProbe
    ? NextResponse.next({ request: { headers: forwarded } })
    : await withClerk(new NextRequest(request, { headers: forwarded }), event);
  if (response) response.headers.set("x-pravi-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk endpoints
    "/__clerk/:path*",
  ],
};
