import { redirect } from "next/navigation";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import TeamManager from "./team-manager";

// Team management — org_admin only.
export default async function PeoplePage() {
  const state = await getSessionState();
  if (state.status === "needs-setup") redirect("/finish-setup");
  if (state.status !== "ready" || !isAdminRole(state.profile.role)) redirect("/dashboard");
  return <TeamManager />;
}
