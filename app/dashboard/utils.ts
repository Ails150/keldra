import type { WizardData, ViewingRole } from "../onboarding/types";
import type { Blocker, BlockerMap } from "./lib/blocker-state";

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

// ---------- schedule helpers ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type AssetStatus =
  | "on-track"
  | "in-progress"
  | "at-risk"
  | "slipping"
  | "blocked"
  | "stalled";

// Whole-day delta from `earlier` to `later`. Positive means later is in the future.
export function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  const s = value.toString().trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function hashStringStable(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getAssetPlannedEnd(
  asset: any,
  today: Date = new Date(),
): Date {
  const candidates = [
    parseDate(asset?.green_date),
    parseDate(asset?.yellow_tag_date),
    parseDate(asset?.red_tag_date),
  ].filter((d): d is Date => d !== null);
  if (candidates.length > 0) {
    return new Date(Math.max(...candidates.map((d) => d.getTime())));
  }
  const hash = hashStringStable((asset?.asset_id ?? "").toString());
  // 2–8 weeks from today, deterministic per asset_id.
  const weeks = 2 + (hash % 7);
  return new Date(today.getTime() + weeks * WEEK_MS);
}

export function getLinkedBlockers(
  asset: any,
  blockerMap: BlockerMap | null,
): Blocker[] {
  if (!blockerMap) return [];
  const id = (asset?.asset_id ?? "").toString().trim();
  if (!id) return [];
  return Object.values(blockerMap).filter(
    (b) =>
      b.state !== "closed" &&
      b.linked_assets.some((a) => a.trim() === id),
  );
}

export function getAssetActualStatus(
  asset: any,
  blockerMap: BlockerMap | null,
): AssetStatus {
  const owner = (asset?.owner_name ?? "").toString().trim();
  if (!owner) return "blocked";

  const stage = (asset?.current_stage ?? "").toString().toLowerCase();
  if (stage.includes("delivered") && stage.includes("not installed"))
    return "stalled";
  if (stage.includes("green") || stage.includes("handover"))
    return "on-track";
  if (stage.includes("yellow")) return "at-risk";
  if (stage.includes("red")) return "slipping";
  if (
    stage.includes("designed") ||
    stage.includes("delivered") ||
    stage.includes("installed")
  )
    return "in-progress";

  // Fall back to checking linked blockers — if any are open, treat as blocked.
  if (getLinkedBlockers(asset, blockerMap).length > 0) return "blocked";
  return "in-progress";
}

const STATUS_RANK: Record<AssetStatus, number> = {
  blocked: 6,
  stalled: 5,
  slipping: 4,
  "at-risk": 3,
  "in-progress": 2,
  "on-track": 1,
};

export function worstStatus(items: AssetStatus[]): AssetStatus {
  if (items.length === 0) return "in-progress";
  return items.reduce((acc, s) =>
    STATUS_RANK[s] > STATUS_RANK[acc] ? s : acc,
  );
}

export function groupAssetsByWorkPackage(
  assets: any[],
): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const a of assets) {
    const sys = (a?.system ?? "").toString().trim();
    const loc = (a?.location ?? "").toString();
    const type = (a?.asset_type ?? "").toString();

    let key: string;
    if (sys) {
      key = sys;
    } else if (/MMR\s*1/i.test(loc)) {
      key = "MEP Plant Room MMR1";
    } else if (/MMR\s*2/i.test(loc)) {
      key = "MEP Plant Room MMR2";
    } else if (/colo|hall/i.test(loc)) {
      key = "Colo Halls";
    } else if (/cable\s*tray|containment/i.test(type)) {
      key = "Containment";
    } else if (/\bUPS\b|\bPNL\b|\bUPM\b|\bGEN\b/i.test(type)) {
      key = "Power";
    } else if (/\bHRU\b|\bAHU\b|\bCRAC\b|\bCHW\b/i.test(type)) {
      key = "Cooling";
    } else {
      key = "Other";
    }

    const existing = groups.get(key) ?? [];
    existing.push(a);
    groups.set(key, existing);
  }
  return groups;
}
