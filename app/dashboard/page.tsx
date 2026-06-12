// Public demo stays ungated and localStorage-driven. Any AUTHENTICATED org now
// renders from its own DB rows: no "ardmac" name gate — an org is just an org
// whose DB happens to have data. No data → empty state + "Start with sample
// data". Confirmed-but-unmapped user → /finish-setup. Field role → /field.
import { redirect } from "next/navigation";
import DashboardShell from "./dashboard-shell";
import { getSessionState, isAdminRole, isFieldRole, canWrite } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { loadOrgDashboard, type OrgDashboard } from "@/lib/org/dashboard-data";

export default async function Dashboard() {
  const state = await getSessionState();

  if (state.status === "needs-setup") redirect("/finish-setup");

  if (state.status === "ready") {
    const { profile, email } = state;
    if (isFieldRole(profile.role)) redirect("/field");

    const isSuper = profile.role === "superadmin";
    const orgName = profile.org_name ?? (isSuper ? "All orgs" : "Your org");

    // Render from the DB. On a missing-table error (pre-migration) fall back to
    // the demo so nothing breaks; with the migration applied this is the path.
    let dbDashboard: OrgDashboard | null = null;
    if (profile.org_id) {
      try {
        const supabase = await createClient();
        dbDashboard = await loadOrgDashboard(supabase, orgName);
      } catch {
        dbDashboard = null; // tables not migrated yet → demo fallback below
      }
    }

    const common = {
      userEmail: email,
      orgBadge: profile.org_name ?? (isSuper ? "All orgs · superadmin" : null),
      canInvite: isAdminRole(profile.role),
      canWrite: canWrite(profile.role),
    };

    if (dbDashboard?.hasData) {
      return <DashboardShell {...common} showDemo={false} dbDashboard={dbDashboard} />;
    }
    if (dbDashboard && !dbDashboard.hasData) {
      // Migrated, but the org has no data yet → empty state + sample button.
      return <DashboardShell {...common} showDemo={false} />;
    }
    // Pre-migration fallback only: keep the org working on the demo seed.
    return <DashboardShell {...common} showDemo />;
  }

  const emailFallback = state.status === "unverified" ? state.email : "demo@keldra.io";
  return <DashboardShell userEmail={emailFallback} orgBadge={null} showDemo canInvite={false} />;
}
