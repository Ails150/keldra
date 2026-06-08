// Public demo stays ungated. When a real user is signed in we pass their email
// + organisation through so the dashboard reflects (and scopes to) their org.
// Everything is defensive: before the org migration runs, or for anonymous
// visitors, this falls straight back to the demo identity.
import DashboardShell from "./dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export default async function Dashboard() {
  let userEmail = "demo@keldra.io";
  let orgBadge: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userEmail = user.email ?? userEmail;
      const { data } = await supabase
        .from("users")
        .select("role, organisations(name)")
        .eq("id", user.id)
        .maybeSingle();
      const org = data?.organisations as { name?: string } | { name?: string }[] | null | undefined;
      const name = Array.isArray(org) ? org[0]?.name : org?.name;
      if (name) orgBadge = name;
      else if (data?.role === "superadmin") orgBadge = "All orgs · superadmin";
    }
  } catch {
    // users table not migrated yet, or no session — keep the demo identity.
  }

  return <DashboardShell userEmail={userEmail} orgBadge={orgBadge} />;
}
