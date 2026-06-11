// Where a user lands after auth, by role. Field users live in the phone-first
// /field surface; everyone else gets the web dashboard. Shared by the reset
// flow and the role routing.
export function landingPathForRole(role: string | null | undefined): string {
  return role === "field" ? "/field" : "/dashboard";
}
