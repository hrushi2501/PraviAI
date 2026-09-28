import { createAdminClient } from "@/lib/supabase/server";
import { DomainError } from "@/server/db/error-mapper";

export function evidenceStorageClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new DomainError(
      "Protected evidence storage is not configured.",
      "SERVICE_UNAVAILABLE",
      503,
    );
  return createAdminClient((input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
  );
}
export async function privateEvidenceBucket(
  client: ReturnType<typeof createAdminClient>,
) {
  const bucket = process.env.SUPABASE_EVIDENCE_BUCKET ?? "asset-evidence";
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(bucket))
    throw new DomainError(
      "Protected evidence bucket configuration is invalid.",
      "SERVICE_UNAVAILABLE",
      503,
    );
  const result = await client.storage.getBucket(bucket);
  if (result.error || !result.data || result.data.public)
    throw new DomainError(
      "Evidence requires an existing private storage bucket.",
      "SERVICE_UNAVAILABLE",
      503,
    );
  return { name: bucket, storage: client.storage.from(bucket) };
}
