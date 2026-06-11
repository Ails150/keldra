import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/profile";
import OrgConfigEditor from "./editor";

// Superadmin-only per-org calibration screen (terminology, gate structure,
// blocker taxonomy, escalation cadences) — data entry, not code.
export default async function OrgConfigPage() {
  const state = await getSessionState();
  if (state.status !== "ready" || state.profile.role !== "superadmin") {
    redirect("/dashboard");
  }
  return <OrgConfigEditor />;
}
