import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  role: string;
  org_name: string | null;
};

// What the current request's session looks like, used to gate the dashboard,
// the finish-setup guardrail and the superadmin health check.
//
//  - anonymous   : no auth user → public demo path (untouched).
//  - needs-setup : auth user exists but has NO public.users row → friendly
//                  "finish setup" screen instead of a crash.
//  - ready       : auth user + profile row resolved.
//  - unverified  : the users query failed (e.g. migration not run yet). Treated
//                  like the demo path so a pre-migration deploy never crashes.
export type SessionState =
  | { status: "anonymous" }
  | { status: "needs-setup"; email: string }
  | { status: "unverified"; email: string }
  | { status: "ready"; email: string; profile: Profile };

export async function getSessionState(): Promise<SessionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, full_name, role, organisations(name)")
    .eq("id", user.id)
    .maybeSingle();

  // Query error usually means the org migration hasn't run on this project yet.
  // Don't punish the user with a setup screen — fall back to the demo path.
  if (error) return { status: "unverified", email: user.email ?? "" };

  // Authenticated, migration present, but no profile row → genuine setup gap.
  if (!data) return { status: "needs-setup", email: user.email ?? "" };

  const org = data.organisations as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const org_name = Array.isArray(org) ? org[0]?.name ?? null : org?.name ?? null;

  return {
    status: "ready",
    email: user.email ?? "",
    profile: {
      id: data.id,
      org_id: data.org_id,
      full_name: data.full_name,
      role: data.role,
      org_name,
    },
  };
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "org_admin" || role === "superadmin";
}

// Field-app users live entirely in /field; never the dashboard.
export function isFieldRole(role: string | null | undefined): boolean {
  return role === "field";
}

// Viewers are read-only; field users don't use the dashboard write surfaces.
// Everyone else (member/manager/org_admin/superadmin + legacy roles) can write.
export function canWrite(role: string | null | undefined): boolean {
  return role !== "viewer" && role !== "field";
}
