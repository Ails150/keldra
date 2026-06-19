// Client-safe asset→gate mapping + per-asset forecast. No server-only deps, so
// both the server loader and client views can import these.

// Provisional asset→gate heuristic (by system). Flagged as an open question in
// keldra-tag-model-plan.md; a single derivation point to revise once confirmed.
export function gateForSystem(system: string): string | null {
  switch ((system || "").toLowerCase()) {
    case "power": return "B";
    case "cooling": return "C";
    case "controls": return "D";
    case "fire": return "E";
    default: return null;
  }
}

const DAY = 86_400_000;
const LEAD_DAYS = 4; // simple pattern: each outstanding item ~ this many days of work

// Per-asset forecast vs the baseline programme: project completion of the next
// tag from the remaining (outstanding) checklist work, compare to the baseline
// target_date. NOT ML — a transparent days estimate that sharpens with history.
export function forecastAsset(
  tag: "red" | "yellow" | "green",
  outstanding: number,
  targetDate: string | null,
  nowMs: number = Date.now(),
): { lateDays: number; onTrack: boolean } {
  if (tag === "green" || outstanding <= 0 || !targetDate) return { lateDays: 0, onTrack: true };
  const baseline = new Date(targetDate).getTime();
  if (Number.isNaN(baseline)) return { lateDays: 0, onTrack: true };
  const projected = nowMs + outstanding * LEAD_DAYS * DAY;
  const lateDays = Math.round((projected - baseline) / DAY);
  return lateDays > 0 ? { lateDays, onTrack: false } : { lateDays: 0, onTrack: true };
}
