// Public demo stays ungated. When a real user is signed in we resolve their
// organisation and scope what they see:
//   - anonymous / pre-migration  → the synthetic public demo (untouched).
//   - Ardmac member / superadmin → the seeded MER demo (Ardmac's data today).
//   - any other real org         → a clean, empty, RLS-isolated dashboard.
//   - confirmed user, no profile → /finish-setup (friendly, not a crash).
import { redirect } from "next/navigation";
import DashboardShell from "./dashboard-shell";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";

export default async function Dashboard() {
  const state = await getSessionState();

  // Guardrail: confirmed auth user with no public.users row.
  if (state.status === "needs-setup") redirect("/finish-setup");

  if (state.status === "ready") {
    const { profile, email } = state;
    const isSuper = profile.role === "superadmin";
    const isDemoOrg = (profile.org_name ?? "").trim().toLowerCase() === "ardmac";
    return (
      <DashboardShell
        userEmail={email}
        orgBadge={profile.org_name ?? (isSuper ? "All orgs · superadmin" : null)}
        showDemo={isSuper || isDemoOrg}
        canInvite={isAdminRole(profile.role)}
      />
    );
  }

  // anonymous (public demo) or unverified (migration not run yet) → demo path.
  const email = state.status === "unverified" ? state.email : "demo@keldra.io";
  return <DashboardShell userEmail={email} orgBadge={null} showDemo canInvite={false} />;
}
