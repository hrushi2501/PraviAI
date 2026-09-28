import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Direct upload signatures must be bound to an authorized evidence parent.
  // Keep uploads unavailable until parent permission checks and verified upload
  // metadata are implemented; a signed-in session alone is insufficient.
  return NextResponse.json(
    {
      success: false,
      error:
        "Evidence uploads are unavailable until authorized upload handling is configured",
    },
    { status: 503 },
  );
}
