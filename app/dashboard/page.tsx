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
        dbDashboard = await loadOrgDashboard(supabase, orgName, profile.org_id);
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
    // A logged-in org NEVER rides the synthetic demo: with data it renders the
    // DB path above; without data (or a pre-migration error) it gets the clean
    // empty state + "Start with sample data". showDemo is anonymous-only.
    return <DashboardShell {...common} showDemo={false} />;
  }

  // Logged-in but profile unresolved (pre-migration / transient) → keep the demo
  // as a safety net so a half-set-up session never crashes.
  if (state.status === "unverified") {
    return <DashboardShell userEmail={state.email} orgBadge={null} showDemo canInvite={false} />;
  }

  // Anonymous (logged-out) visitor → the public synthetic demo.
  return <DashboardShell userEmail="demo@keldra.io" orgBadge={null} showDemo canInvite={false} />;
}
