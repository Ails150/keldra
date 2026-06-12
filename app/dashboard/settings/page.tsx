import { redirect } from "next/navigation";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import CommercialsEditor from "./commercials-editor";

// Org settings — org-admin self-serve. Commercials (cost-of-delay) live here so
// it's not superadmin-only config.
export default async function SettingsPage() {
  const state = await getSessionState();
  if (state.status === "needs-setup") redirect("/finish-setup");
  if (state.status !== "ready" || !isAdminRole(state.profile.role)) redirect("/dashboard");
  return <CommercialsEditor />;
}
