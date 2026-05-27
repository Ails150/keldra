// Procore document completion for an asset. In the demo this is derived from
// the asset's stage (and a stable per-asset hash) rather than stored, so the
// flat CSV register doesn't need a nested column.

import { normalizeStage, type CxStage } from "./cx-stages";

export type DocCompletion = {
  total: number;
  complete: number;
  missing: string[];
  percentage: number;
  source: "procore" | "manual" | "import";
};

// Canonical 15-doc set from Johnny's tracker.
export const DOC_SET = [
  "Authorization to Ship",
  "Asset Set in Place Checklist",
  "Delivery / Receipt Checklist",
  "Inspection and Test Plan (ITP)",
  "Routine Test Report",
  "FAT / FWT Reports",
  "Technical Submittals (Status A)",
  "Type Test Report",
  "Installation, Operation & Maintenance Manual",
  "Test Equipment Calibration Certificates",
  "SOO (Sequence of Operations)",
  "DOO (Demonstration of Operations)",
  "Drawing Markups",
  "Packing List",
  "Spare Parts List",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// % complete band per stage (low → high through the flow).
const BAND: Record<CxStage, [number, number]> = {
  Delivered: [0, 40],
  RT: [10, 40],
  "Off YT": [50, 75],
  "Off GT": [78, 95],
  "On YT": [80, 95],
  "On GT": [100, 100],
};

export function deriveDocCompletion(asset: any): DocCompletion {
  // Respect an explicitly-attached object if present.
  if (asset?.doc_completion && typeof asset.doc_completion === "object") {
    return asset.doc_completion as DocCompletion;
  }
  const stage = normalizeStage(asset?.current_stage);
  const [lo, hi] = BAND[stage];
  const total = DOC_SET.length;
  const h = hash((asset?.asset_id ?? "").toString());
  const pct = hi === lo ? lo : lo + (h % (hi - lo + 1));
  const complete = Math.min(total, Math.round((pct / 100) * total));
  // Missing = the trailing docs not yet complete (DOO / markups / spares fall
  // off last, matching the real-world pattern).
  const missing = DOC_SET.slice(complete);
  return {
    total,
    complete,
    missing,
    percentage: complete === total ? 100 : pct,
    source: "procore",
  };
}
