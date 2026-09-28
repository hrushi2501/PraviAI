import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(
          process.env.NODE_ENV === "production",
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        ),
      },
    ];
  },
};

export default nextConfig;
