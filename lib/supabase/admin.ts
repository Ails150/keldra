import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// SERVICE-ROLE client. Bypasses RLS — use ONLY in server route handlers for the
// privileged sign-up writes (create org, map public.users, claim invite,
// store inbound email + attachments). The `server-only` import makes the build
// fail loudly if this file is ever pulled into a client bundle, so the service
// key can never reach the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add the " +
        "service-role key to .env.local (local) AND Netlify env vars (production).",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Plain ANON client with NO session persistence — used server-side to call
// auth.signUp so the confirmation email is sent, WITHOUT logging the visitor in
// (they must confirm their email first). Distinct from lib/supabase/server.ts,
// which is the cookie-bound client for already-authenticated requests.
export function createSignupClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
