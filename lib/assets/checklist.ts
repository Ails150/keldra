// Single source of truth for the per-tag checklist templates + the strict
// ladder helpers. Shared by the seed and the dependency engine so they never
// drift. Each item: { label, owner }. next_checklist on an asset = the items
// needed to reach the NEXT tag.
export type ChecklistItem = { label: string; status: "approved" | "outstanding"; owner: string };

export const RYG_TEMPLATE: Record<"red" | "yellow", { label: string; owner: string }[]> = {
  red: [
    { label: "Equipment in place", owner: "J. Brennan" },
    { label: "Documentation loaded for testing", owner: "M. Walsh" },
    { label: "Cables installed", owner: "MEP Sub" },
    { label: "Panel terminations complete", owner: "MEP Sub" },
    { label: "Power-on test booked", owner: "Cx Engineer" },
  ],
  yellow: [
    { label: "Integrated systems test passed", owner: "Cx Sub" },
    { label: "Witness sign-off complete", owner: "Commissioning Lead" },
    { label: "Snag list closed", owner: "Main Contractor" },
    { label: "Handover pack uploaded", owner: "Document Control" },
  ],
};

export type Tag = "red" | "yellow" | "green";

// Strict ladder — each requires the previous; no skipping/reordering.
export function nextTag(tag: Tag): "yellow" | "green" | null {
  if (tag === "red") return "yellow";
  if (tag === "yellow") return "green";
  return null; // green is terminal
}

// The fresh (all-outstanding) checklist toward the NEXT tag, for an asset that
// has just arrived at `tag`. Green carries no checklist (operational).
export function freshChecklist(tag: Tag): ChecklistItem[] {
  if (tag === "green") return [];
  return RYG_TEMPLATE[tag].map((it) => ({ label: it.label, owner: it.owner, status: "outstanding" as const }));
}
