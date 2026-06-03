// Deterministic synthetic Cx asset register for the demo. ~300 believable rows
// across the MER zones, with dates anchored to the demo "today" (Thu 28 May 26)
// and consistent with the "18 days behind" story. A blocked cohort in COLO Hall
// 1 carries per-day burns that sum to the £73k/day headline. No real names,
// orgs or asset tags — everything is generated.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const DEMO_TODAY = "2026-05-28";
export const TOTAL_BURN_PER_DAY = 73000;

export type DemoAsset = {
  asset_id: string;
  asset_type: string;
  current_stage: string;
  owner_name: string;
  owner_org: string;
  location: string;
  system: string;
  red_tag_date: string;
  yellow_tag_date: string;
  green_date: string;
  notes: string;
  activity_id: string;
  burn_per_day: number;
};

// system -> [type label, id abbreviation]
const TYPES: Record<string, [string, string][]> = {
  Cooling: [
    ["CRAC Unit", "CRAC"], ["Air Handling Unit", "AHU"], ["Heat Rejection Unit", "HRU"],
    ["Chilled Water Pump", "CHWP"], ["Fan Coil Unit", "FCU"], ["CRAH Unit", "CRAH"],
  ],
  Power: [
    ["UPS Module", "UPM"], ["Distribution Panel", "PNL"], ["Auto Transfer Switch", "ATS"],
    ["Busbar Section", "BUS"], ["Power Distribution Unit", "PDU"], ["Switchboard", "MSB"],
  ],
  Controls: [
    ["Remote I/O Panel", "RIO"], ["TCP Panel", "TCP"], ["BMS Controller", "CC"],
    ["Pressure Differential Panel", "PDP"], ["ACU Panel", "ACU"],
  ],
  Fire: [["Vesda Fire Panel", "EWSD"], ["Sprinkler Valve Set", "SPV"]],
};
const SYSTEMS = Object.keys(TYPES);

// zone code -> [display location, weighting of "commissioned-ness" 0..1]
const ZONES: [string, string, number][] = [
  ["COLO1", "Colo Hall 1", 0.45],
  ["COLO2", "Colo Hall 2", 0.7],
  ["COLO3", "Colo Hall 3", 0.85],
  ["COLO4", "Colo Hall 4", 0.9],
  ["MMR1", "MMR1", 0.6],
  ["MMR2", "MMR2", 0.75],
  ["MER1", "MER1 Main Electrical Room", 0.8],
  ["MER2", "MER2 Main Electrical Room", 0.82],
  ["EARTH", "Earthing Network", 0.7],
  ["ADMIN", "Admin Plant", 0.88],
];

const OWNERS: [string, string][] = [
  ["Mech Cx Engineer", "Mech Sub"],
  ["MEP Cx Engineer", "MEP Sub"],
  ["Controls Engineer", "Controls Sub"],
  ["Fire Engineer", "Fire Sub"],
  ["Site Manager", "Main Contractor"],
  ["Cx Engineer", "Cx Sub"],
];

const STAGES = ["On GT", "Off GT", "On YT", "Off YT", "RT", "Delivered"] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ISO date `days` after DEMO_TODAY (negative = before).
function dateOffset(days: number): string {
  const d = new Date(DEMO_TODAY + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Pick a stage from a per-asset hash, biased by the zone's commissioned-ness.
function pickStage(h: number, commissioned: number): string {
  const r = (h % 1000) / 1000;
  if (r < commissioned * 0.62) return "On GT"; // fully commissioned
  if (r < commissioned * 0.82) return "Off GT";
  if (r < commissioned * 0.9) return "On YT";
  if (r < commissioned * 0.95) return "Off YT";
  if (r < commissioned * 0.985) return "Delivered";
  return "RT"; // red-tagged — the problem cohort
}

// The 15 headline blocked assets — COLO Hall 1 cooling/power, red-tagged, ~18
// days behind. £/day burn is owned by the live blocker set (demo-store), not the
// asset rows, so every surface reads one number — these carry no intrinsic burn.
function blockedCohort(): DemoAsset[] {
  const specs: [string, string, string][] = [
    ["CRAC", "CRAC Unit", "Cooling"], ["CRAC", "CRAC Unit", "Cooling"], ["AHU", "Air Handling Unit", "Cooling"],
    ["CRAH", "CRAH Unit", "Cooling"], ["CHWP", "Chilled Water Pump", "Cooling"], ["HRU", "Heat Rejection Unit", "Cooling"],
    ["ATS", "Auto Transfer Switch", "Power"], ["ATS", "Auto Transfer Switch", "Power"], ["UPM", "UPS Module", "Power"],
    ["PNL", "Distribution Panel", "Power"], ["BUS", "Busbar Section", "Power"], ["RIO", "Remote I/O Panel", "Controls"],
    ["TCP", "TCP Panel", "Controls"], ["EWSD", "Vesda Fire Panel", "Fire"], ["PDP", "Pressure Differential Panel", "Controls"],
  ];
  return specs.map(([abbr, type, system], i) => {
    const owner = OWNERS[hash(abbr + i) % OWNERS.length];
    return {
      asset_id: `MER-COLO1-${abbr}${String(20 + i).padStart(2, "0")}`,
      asset_type: type,
      current_stage: "RT",
      owner_name: owner[0],
      owner_org: owner[1],
      location: "Colo Hall 1",
      system,
      red_tag_date: dateOffset(-18 - (i % 4)), // raised ~18 days ago
      yellow_tag_date: "",
      green_date: "", // planned green has passed; still red-tagged = behind
      notes: "Cooling commissioning blocked — Gate C",
      activity_id: "",
      burn_per_day: 0,
    };
  });
}

export function generateAssets(): DemoAsset[] {
  const out: DemoAsset[] = [...blockedCohort()];
  for (const [zone, location, commissioned] of ZONES) {
    // COLO1 already has its blocked cohort; give every zone a realistic spread.
    const count = zone === "COLO1" ? 22 : 30 + (hash(zone) % 10);
    for (let i = 0; i < count; i++) {
      const system = SYSTEMS[hash(zone + i + "s") % SYSTEMS.length];
      const [type, abbr] = TYPES[system][hash(zone + i + "t") % TYPES[system].length];
      const id = `MER-${zone}-${abbr}${String(i + 1).padStart(2, "0")}`;
      const h = hash(id);
      const stage = pickStage(h, commissioned);
      const owner = OWNERS[h % OWNERS.length];
      const commissionedStage = stage === "On GT" || stage === "Off GT";
      const green = commissionedStage ? dateOffset(-((h % 40) + 2)) : "";
      const yellow = stage.includes("YT") ? dateOffset(-((h % 12) + 1)) : commissionedStage ? dateOffset(-((h % 40) + 10)) : "";
      const red = stage === "RT" ? dateOffset(-((h % 14) + 1)) : "";
      out.push({
        asset_id: id,
        asset_type: type,
        current_stage: stage,
        owner_name: stage === "Delivered" ? "" : owner[0],
        owner_org: owner[1],
        location,
        system,
        red_tag_date: red,
        yellow_tag_date: yellow,
        green_date: green,
        notes: "",
        activity_id: "",
        burn_per_day: 0,
      });
    }
  }
  return out;
}

export type AssetStats = {
  total: number;
  commissioned: number;
  redTagged: number;
  atRisk: number;
  burnPerDay: number;
};

export function assetStats(assets: any[]): AssetStats {
  let commissioned = 0, redTagged = 0, atRisk = 0, burnPerDay = 0;
  for (const a of assets) {
    const s = (a.current_stage ?? "").toString();
    if (s === "On GT" || s === "Off GT") commissioned++;
    else if (s === "RT") redTagged++;
    else if (s.includes("YT")) atRisk++;
    burnPerDay += Number(a.burn_per_day) || 0;
  }
  return { total: assets.length, commissioned, redTagged, atRisk, burnPerDay };
}
