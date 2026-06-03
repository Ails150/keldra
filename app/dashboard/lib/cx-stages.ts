// Commissioning Lead's actual MER commissioning flow, used as the canonical asset stage
// set across the product.
//
// FWT (factory) → RT (Red Tag) → Off YT/GT (offline) → On YT/GT (online).

export const CX_STAGES = [
  "Delivered",
  "RT",
  "Off YT",
  "Off GT",
  "On YT",
  "On GT",
] as const;

export type CxStage = (typeof CX_STAGES)[number];

type StageMeta = {
  caption: string;
  // Assets kanban column tokens.
  bg: string;
  border: string;
  text: string;
  // Map dot colours.
  dotFill: string;
  dotStroke: string;
};

export const STAGE_META: Record<CxStage, StageMeta> = {
  Delivered: {
    caption: "On site, awaiting install",
    bg: "bg-paper-warm",
    border: "border-paper-line",
    text: "text-ink-mid",
    dotFill: "#B4B2A9",
    dotStroke: "#807E76",
  },
  RT: {
    caption: "Red Tag · install verified",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    dotFill: "#A32D2D",
    dotStroke: "#6E1E1E",
  },
  "Off YT": {
    caption: "Yellow Tag · defect offline",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    dotFill: "#EF9F27",
    dotStroke: "#B5740F",
  },
  "Off GT": {
    caption: "Green Tag · offline cleared",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    dotFill: "#97C459",
    dotStroke: "#5E8A2E",
  },
  "On YT": {
    caption: "Yellow Tag · defect during run",
    bg: "bg-amber-100",
    border: "border-amber-300",
    text: "text-amber-900",
    dotFill: "#F4A340",
    dotStroke: "#B5740F",
  },
  "On GT": {
    caption: "Green Tag · fully commissioned",
    bg: "bg-green-100",
    border: "border-green-400",
    text: "text-green-900",
    dotFill: "#5BA13B",
    dotStroke: "#3B6D11",
  },
};

// Map any legacy / free-text stage onto the canonical six.
export function normalizeStage(raw: unknown): CxStage {
  const s = (raw ?? "").toString().trim();
  if ((CX_STAGES as readonly string[]).includes(s)) return s as CxStage;
  const l = s.toLowerCase();
  if (l.includes("on gt") || l.includes("commission")) return "On GT";
  if (l === "green" || l.includes("handover")) return "On GT";
  if (l.includes("off gt")) return "Off GT";
  if (l.includes("on yt")) return "On YT";
  if (l.includes("off yt") || l === "yellow") return "Off YT";
  if (l.includes("rt") || l.includes("red")) return "RT";
  if (l.includes("deliver") || l.includes("install") || l.includes("design"))
    return "Delivered";
  return "Delivered";
}

export function isCxStage(raw: unknown): raw is CxStage {
  return (CX_STAGES as readonly string[]).includes((raw ?? "").toString());
}

// Next stage in the flow (clamps at On GT).
export function nextStage(raw: unknown): CxStage {
  const cur = normalizeStage(raw);
  const i = CX_STAGES.indexOf(cur);
  return CX_STAGES[Math.min(i + 1, CX_STAGES.length - 1)];
}

export function stageMeta(raw: unknown): StageMeta {
  return STAGE_META[normalizeStage(raw)];
}

// ---------- P6 site-map Cx stages ----------
// The real MER commissioning flow as it reads on the programme. Site module
// install does not begin until 17 Aug 26, so today every in-flight task is
// off-site (L1/L2-L3); the later stages stay empty by design — that emptiness
// is the point. "Owner unclear" is Keldra's wedge: work nobody on site owns.

import { BRAND } from "@/lib/brand";

export type MapStageKey =
  | "l1"
  | "l2l3"
  | "module"
  | "onsite"
  | "preenergy"
  | "greentag"
  | "unclear";

export type MapStage = {
  key: MapStageKey;
  label: string;
  caption: string;
  fill: string;
};

// Dark→light purple ramp, teal terminus for Green Tag/BU, red for owner-unclear.
export const MAP_STAGES: MapStage[] = [
  { key: "l1", label: "L1 Off-Site", caption: "off-site factory witness test in progress", fill: BRAND.cxOffsite },
  { key: "l2l3", label: "L2/L3 Off-Site", caption: "off-site acceptance / integrated", fill: BRAND.purpleDeep },
  { key: "module", label: "Module Install", caption: "on-site, starts 17 Aug 26", fill: BRAND.purple },
  { key: "onsite", label: "On-Site Cx", caption: "L1/L2/L3 on-site", fill: BRAND.cxOnsite },
  { key: "preenergy", label: "Pre-Energization", caption: "ahead of power-on, 03 Sep 26", fill: BRAND.cxPreEnergy },
  { key: "greentag", label: "Green Tag / BU", caption: "commissioned · 02 Dec 26", fill: BRAND.teal },
  { key: "unclear", label: "Owner unclear", caption: "no one on site owns the next move", fill: BRAND.dangerInk },
];

const MAP_STAGE_BY_KEY: Record<MapStageKey, MapStage> = MAP_STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<MapStageKey, MapStage>,
);

export function mapStageMeta(key: MapStageKey): MapStage {
  return MAP_STAGE_BY_KEY[key];
}

// Companies that hold work without owning the next physical move on site —
// when one of these is blocking, accountability is genuinely unclear.
const OFF_SITE_HOLDERS = new Set(["design-house", "drawings-office", "client-network"]);

// Derive a Cx map stage from a baseline task. We only have status + holder, and
// the whole project is pre-install today, so dots land on the early stages or
// flag as owner-unclear; the on-site/energization/green-tag stages stay empty.
export function taskMapStage(task: {
  status: string;
  blocking_company: string | null;
}): MapStageKey {
  if (
    (task.status === "blocked" || task.status === "not_started_should_be") &&
    task.blocking_company &&
    OFF_SITE_HOLDERS.has(task.blocking_company)
  ) {
    return "unclear";
  }
  if (task.status === "on_track" || task.status === "complete") return "l2l3";
  return "l1"; // blocked (clear owner) or not-yet-started, stalled at the front
}
