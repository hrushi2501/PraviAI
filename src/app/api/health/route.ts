import { NextResponse } from "next/server";
import { releaseIdentity } from "@/lib/health";

export function GET() {
  return NextResponse.json(
    { status: "ok", release: releaseIdentity() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
