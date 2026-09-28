import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Admin / Service Role Client (Server-side only)
 *
 * Use this in Server Components, Route Handlers, or Server Actions
 * for administrative tasks (e.g. Storage bucket management, backend migrations).
 * NEVER expose the SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient(fetcher?: typeof fetch) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client",
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
