import type { WizardData, ViewingRole } from "../onboarding/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ORG_COLOURS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#0f766e",
];

export function deriveOrgColour(org: string): string {
  const key = (org || "").trim().toLowerCase();
  if (!key) return "#5a4a72";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ORG_COLOURS[h % ORG_COLOURS.length];
}

// Deterministic 0-100 from a name. Used for demo kept-rates that stay
// stable across reloads.
export function deriveKeptRate(name: string): number {
  const key = (name || "").trim().toLowerCase();
  if (!key) return 80;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
  // bias toward 55–96 so the demo never shows a 100% or 0%
  return 55 + (h % 42);
}

export function formatCurrency(n: number, ccy = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `€${n.toLocaleString()}`;
  }
}

export function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normaliseOrg(s: string): string {
  return (s || "").trim().toLowerCase();
}

export function isBlankOwner(row: any): boolean {
  return ((row?.owner_name ?? "") as string).toString().trim() === "";
}

// Map a free-text org name to a canonical short key the role filters can
// reason about ("ardmac", "mercury", "central", "client", ...).
export function orgKey(name: string): string {
  const n = normaliseOrg(name);
  if (!n) return "";
  if (n.includes("ardmac")) return "ardmac";
  if (n.includes("mercury")) return "mercury";
  if (n.includes("central")) return "central";
  if (n.includes("primo")) return "primo";
  if (n.includes("hyperscaler") || n.includes("client")) return "client";
  return n;
}

export function roleLabel(role: ViewingRole): string {
  switch (role) {
    case "main-contractor":
      return "Main contractor";
    case "subcontractor":
      return "Subcontractor";
    case "client":
      return "Client";
    case "design":
      return "Design";
    default:
      return "Originating org";
  }
}

export type FilterRole = ViewingRole | "originating";

// Filter a team-roster row set by viewing role.
export function filterPeopleByRole(
  team: any[] | null,
  role: FilterRole,
  activeOrg: string,
): any[] {
  if (!team || team.length === 0) return [];
  const key = orgKey(activeOrg);
  switch (role) {
    case "subcontractor":
      return team.filter((r) => orgKey(r.organisation) === key);
    case "design":
      return team.filter((r) => orgKey(r.organisation) === "central");
    case "client":
      // Client never sees individual people — caller should render org rollups instead.
      return [];
    default:
      return team;
  }
}

export function filterAssetsByRole(
  assets: any[] | null,
  role: FilterRole,
  activeOrg: string,
): any[] {
  if (!assets || assets.length === 0) return [];
  const key = orgKey(activeOrg);
  switch (role) {
    case "subcontractor": {
      return assets.filter((r) => {
        if (orgKey(r.owner_org) === key) return true;
        const stage = (r.current_stage ?? "").toString().toLowerCase();
        // Containment / drywall stages keep Ardmac in the loop.
        if (key === "ardmac" && (stage.includes("contain") || stage.includes("drywall")))
          return true;
        return false;
      });
    }
    case "design":
      return assets.filter((r) => {
        const notes = (r.notes ?? "").toString().toLowerCase();
        return notes.includes("rfi") || notes.includes("design");
      });
    case "client":
      return assets; // read-only view of everything
    default:
      return assets;
  }
}

export function filterConstraintsByRole(
  constraints: any[] | null,
  role: FilterRole,
  activeOrg: string,
  team: any[] | null,
): any[] {
  if (!constraints || constraints.length === 0) return [];
  const key = orgKey(activeOrg);
  const teamByName = new Map<string, any>();
  (team ?? []).forEach((p) => {
    const n = (p.name ?? "").toString().trim().toLowerCase();
    if (n) teamByName.set(n, p);
  });
  switch (role) {
    case "subcontractor":
      return constraints.filter((c) => {
        if (orgKey(c.owner_org) === key) return true;
        const raised = (c.raised_by ?? "").toString().trim().toLowerCase();
        const person = teamByName.get(raised);
        if (person && orgKey(person.organisation) === key) return true;
        return false;
      });
    case "design":
      return constraints.filter((c) => {
        const desc = (c.description ?? "").toString().toLowerCase();
        const owner = orgKey(c.owner_org);
        return owner === "central" || desc.includes("design") || desc.includes("rfi");
      });
    case "client":
      return constraints.filter((c) => {
        const pri = (c.priority ?? "").toString().toLowerCase();
        const desc = (c.description ?? "").toString().toLowerCase();
        return pri.includes("critical") || pri.includes("client") || desc.includes("client");
      });
    default:
      return constraints;
  }
}

// Org-level rollup used by the client view.
export type OrgRollup = {
  org: string;
  colour: string;
  keptRate: number;
  peopleCount: number;
};

export function rollupByOrg(team: any[] | null): OrgRollup[] {
  const seen = new Map<string, OrgRollup>();
  (team ?? []).forEach((r) => {
    const name = (r.organisation ?? "").toString().trim();
    if (!name) return;
    const k = name.toLowerCase();
    const existing = seen.get(k);
    if (existing) {
      existing.peopleCount += 1;
    } else {
      seen.set(k, {
        org: name,
        colour: deriveOrgColour(name),
        keptRate: deriveKeptRate(name),
        peopleCount: 1,
      });
    }
  });
  return Array.from(seen.values()).sort((a, b) => b.peopleCount - a.peopleCount);
}

export function readStoredProject(): WizardData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("keldra_demo_project");
    if (!raw) return null;
    return JSON.parse(raw) as WizardData;
  } catch {
    return null;
  }
}
