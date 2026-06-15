import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ApiActor = {
  userId: string;
  orgId: string;
  orgName: string | null;
  role: string;
  fullName: string | null;
  email: string | null;
};

// Authenticate a request and derive org_id / identity / role FROM THE VERIFIED
// SESSION + profile — never from the request body. Supports the browser cookie
// session (the field app) and a Bearer access token (API/mobile clients).
// Service-role writes downstream are only safe because org_id comes from here,
// not from caller-supplied input.
export async function authedActor(request: Request): Promise<ApiActor | null> {
  let userId: string | null = null;
  let email: string | null = null;

  // 1. Bearer token → verify with Supabase (validates signature + not expired).
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const { data, error } = await createAdminClient().auth.getUser(token);
    if (!error && data.user) {
      userId = data.user.id;
      email = data.user.email ?? null;
    }
  }

  // 2. Cookie session (browser).
  if (!userId) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      userId = data.user.id;
      email = data.user.email ?? null;
    }
  }

  if (!userId) return null;

  // Org + role come from the user's profile, keyed by the VERIFIED user id.
  const { data: prof } = await createAdminClient()
    .from("users")
    .select("org_id, role, full_name, organisations(name)")
    .eq("id", userId)
    .maybeSingle<{
      org_id: string | null;
      role: string;
      full_name: string | null;
      organisations: { name?: string } | { name?: string }[] | null;
    }>();
  if (!prof?.org_id) return null;

  const org = prof.organisations;
  const orgName = Array.isArray(org) ? org[0]?.name ?? null : org?.name ?? null;
  return { userId, orgId: prof.org_id, orgName, role: prof.role, fullName: prof.full_name, email };
}
