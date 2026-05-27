// Johnny's actual DUB-16 commissioning flow, used as the canonical asset stage
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
