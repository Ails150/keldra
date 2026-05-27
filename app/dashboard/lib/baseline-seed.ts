// Real Ardmac DUB-16 P6 baseline (programme revision 21-Apr-26). Activity IDs
// are verbatim from the programme so Mercury / Ardmac can cross-check against
// the PDF live in the demo. Today = 27 May 2026.

import { BRAND, type BrandColour } from "@/lib/brand";

export type Role =
  | "Main contractor"
  | "Subcontractor"
  | "Design"
  | "MS Programming";

export type Company = {
  slug: string;
  name: string;
  role: Role;
  colour: BrandColour;
  punchLine?: string;
};

export const COMPANIES: Company[] = [
  { slug: "cental", name: "Cental", role: "Subcontractor", colour: "coral", punchLine: "Brackets blocking fibre runs." },
  { slug: "sellafield-design", name: "Sellafield Design", role: "Design", colour: "blue", punchLine: "MMR1 design pending — 4 weeks open." },
  { slug: "lawrence-marco", name: "Lawrence → Marco", role: "Design", colour: "amber", punchLine: "External lights spec unsigned — Marco can't cut drawings." },
  { slug: "auto-fire", name: "Auto Fire", role: "Subcontractor", colour: "pink" },
  { slug: "t-bourke", name: "T Bourke", role: "Subcontractor", colour: "teal", punchLine: "Mechanical sub — CRAH connections, COLO 1-4." },
  { slug: "onnec", name: "Onnec", role: "Subcontractor", colour: "indigo", punchLine: "Telecoms sub — fibre crew standing idle on Cental's brackets." },
  { slug: "ardmac", name: "Ardmac", role: "Main contractor", colour: "purple" },
  { slug: "dornans", name: "Dornans", role: "Subcontractor", colour: "green" },
  { slug: "finnings", name: "Finnings", role: "Subcontractor", colour: "slate", punchLine: "Sprinkler diesel pump generators — affects FER BU room." },
  { slug: "ssci-team", name: "SSCI Team", role: "MS Programming", colour: "navy", punchLine: "Corpnet delivery locked to 30 Nov. Slips, BU slips." },
];

export type RoomTag = "BU" | "MMR1" | "MMR2" | "Earth" | "Security";

export type CriticalRoom = {
  code: string;
  name: string;
  tag: RoomTag;
  target: string;
  priority: 1 | 2;
  live?: boolean;
  blockedWeeks?: number;
  blockedBy?: string;
};

export const CRITICAL_ROOMS: CriticalRoom[] = [
  { code: "BU-ER", name: "Entry Room", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-SER", name: "Security Equipment Room", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-FER", name: "Facility Equipment Room", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-MMR", name: "Meet Me Room", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-SCCR", name: "Secondary Corporate Cable Rack", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-SLV", name: "Security Low Voltage", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-IDF", name: "Intermediate Distribution Frame", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-MOR", name: "Middle Of Row", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-SSA", name: "Security Storage Area", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-FOC", name: "Facilities Operation Centre", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-SOC", name: "Security Operations Centre", tag: "BU", target: "02-Dec-26", priority: 1 },
  { code: "BU-RNG", name: "Regional Network Gateway", tag: "BU", target: "02-Dec-26", priority: 1 },
  // Supporting rooms (feed BU).
  { code: "MMR1", name: "MMR1", tag: "MMR1", target: "29-Jun-26", priority: 2, blockedWeeks: 4, blockedBy: "Sellafield Design" },
  { code: "MMR2", name: "MMR2", tag: "MMR2", target: "29-Jun-26", priority: 2 },
  { code: "MER1-LV", name: "MER1 LV Room", tag: "Earth", target: "08-Jul-26", priority: 2 },
  { code: "MER2-LV", name: "MER2 LV Room", tag: "Earth", target: "09-Jul-26", priority: 2 },
  { code: "UPM1", name: "UPM1", tag: "Earth", target: "24-Jul-26", priority: 2 },
  { code: "UPM2", name: "UPM2", tag: "Earth", target: "24-Jul-26", priority: 2 },
  { code: "EARTH-M1", name: "MER1 Earth Bar", tag: "Earth", target: "13-14 May-26", priority: 2, live: true },
  { code: "EARTH-M2", name: "MER2 Earth Bar", tag: "Earth", target: "11 May-26", priority: 2 },
  { code: "SEC-COLO", name: "Security COLO Room", tag: "Security", target: "11-Aug-26", priority: 2 },
];

export const MILESTONES: { key: string; label: string; date: string }[] = [
  { key: "POWER_ON", label: "Power on Grangecastle", date: "03 Sep 26" },
  { key: "YELLOW_TAG", label: "Yellow Tag", date: "04 Nov 26" },
  { key: "GREEN_TAG", label: "Green Tag", date: "02 Dec 26" },
  { key: "BU", label: "Beneficial Use", date: "02 Dec 26" },
  { key: "IST", label: "IST 02 Dec – 28 Jan", date: "02 Dec 26 – 28 Jan 27" },
  { key: "TOC", label: "TOC 29 Jan – 08 Apr 27", date: "29 Jan – 08 Apr 27" },
];

export const BU_TARGET = "2026-12-02";

export type TaskStatus =
  | "complete"
  | "on_track"
  | "blocked"
  | "not_started_should_be";

export type BaselineTask = {
  activity_id: string;
  name: string;
  wbs_path: string;
  responsible_company: string; // slug
  planned_start: string; // ISO
  planned_end: string; // ISO
  planned_manpower: number;
  actual_manpower: number;
  status: TaskStatus;
  blocked_reason: string | null;
  blocking_company: string | null; // slug
  affects_room: string | null; // room code
  cost_per_day: number;
};

// d("13-May-26") → ISO. Month-name parser for the verbatim P6 dates.
function d(s: string): string {
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2})/);
  if (!m) return s;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mi = months.indexOf(m[2].toLowerCase());
  return `20${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export const BASELINE_TASKS: BaselineTask[] = [
  // ---- variance heroes ----
  { activity_id: "ELE-MER-1010", name: "Install Earth Bar MER1", wbs_path: "Electrical Fit Out MER1", responsible_company: "ardmac", planned_start: d("13-May-26"), planned_end: d("14-May-26"), planned_manpower: 4, actual_manpower: 0, status: "not_started_should_be", blocked_reason: "Earth bar install was due 13-14 May. Day 2 with zero men assigned.", blocking_company: "ardmac", affects_room: "EARTH-M1", cost_per_day: 18000 },
  { activity_id: "ELE-COLO-1030", name: "Telecoms Bracketery and Containment", wbs_path: "COLO 1-4 Electrical", responsible_company: "onnec", planned_start: d("13-Mar-26"), planned_end: d("20-Apr-26"), planned_manpower: 4, actual_manpower: 4, status: "blocked", blocked_reason: "Cental have not installed brackets — Onnec cannot run fibre. Open since March.", blocking_company: "cental", affects_room: "BU-MMR", cost_per_day: 20000 },
  { activity_id: "ELE-ADMIN-1020", name: "Install high level Bracketery and Containment AD1-4", wbs_path: "Elec AD01-04", responsible_company: "ardmac", planned_start: d("01-Apr-26"), planned_end: d("01-May-26"), planned_manpower: 3, actual_manpower: 0, status: "blocked", blocked_reason: "Cental bracketery dependency. Affects MMR mech complete date 29-Jun.", blocking_company: "cental", affects_room: "BU-MMR", cost_per_day: 12000 },
  { activity_id: "MEC-COLO-1040", name: "Water services and connections COLO 1-4", wbs_path: "Mechanical Modules 1-4", responsible_company: "ardmac", planned_start: d("21-Apr-26"), planned_end: d("28-Apr-26"), planned_manpower: 5, actual_manpower: 0, status: "blocked", blocked_reason: "Sellafield Design holding water services spec. 4 weeks open. MMR1 mech first fix cannot start.", blocking_company: "sellafield-design", affects_room: "MMR1", cost_per_day: 15000 },
  { activity_id: "FAB-ADMIN-1120", name: "External Service Support Steel", wbs_path: "Facility Modules", responsible_company: "ardmac", planned_start: d("16-Mar-26"), planned_end: d("24-Apr-26"), planned_manpower: 4, actual_manpower: 0, status: "blocked", blocked_reason: "Lawrence has not signed external lights spec. Marco cannot cut steel drawings. 3 weeks unanswered. Not an Ardmac issue.", blocking_company: "lawrence-marco", affects_room: "BU-MMR", cost_per_day: 10000 },
  { activity_id: "PRO-1110", name: "Sprinkler Diesel Pump Generators", wbs_path: "Procurement Sprinkler", responsible_company: "finnings", planned_start: d("14-Oct-25"), planned_end: d("16-Apr-26"), planned_manpower: 0, actual_manpower: 0, status: "not_started_should_be", blocked_reason: "Delivery slipped. Affects FER BU room.", blocking_company: "finnings", affects_room: "BU-FER", cost_per_day: 5000 },
  { activity_id: "FAB-2000", name: "Generator A Install", wbs_path: "Generator Installation", responsible_company: "finnings", planned_start: d("28-May-26"), planned_end: d("02-Jun-26"), planned_manpower: 5, actual_manpower: 0, status: "not_started_should_be", blocked_reason: "Finnings generator A starts tomorrow per baseline. Site not ready?", blocking_company: "finnings", affects_room: "BU-FER", cost_per_day: 4000 },
  { activity_id: "CX-1180", name: "DUB16-ADMIN-XFM01 FWT", wbs_path: "Off Site Commissioning / FWT", responsible_company: "ardmac", planned_start: d("13-May-26"), planned_end: d("14-May-26"), planned_manpower: 2, actual_manpower: 0, status: "not_started_should_be", blocked_reason: "Factory witness test was due 13-14 May. Two weeks open.", blocking_company: "ardmac", affects_room: "BU-MMR", cost_per_day: 9000 },
  { activity_id: "SEC-COLO-1000", name: "FOK for each door type", wbs_path: "Security COLO & ADMIN", responsible_company: "ardmac", planned_start: d("17-Apr-26"), planned_end: d("22-Apr-26"), planned_manpower: 2, actual_manpower: 0, status: "blocked", blocked_reason: "FOK door types waiting on Sellafield spec sign-off AND PRO-1270 door delivery (slipped to 29-May).", blocking_company: "sellafield-design", affects_room: "SEC-COLO", cost_per_day: 7000 },
  // ---- context / on-track ----
  { activity_id: "CX-1440", name: "DUB16-COLO1-MER1-MSB01 FWT", wbs_path: "Off Site Commissioning / FWT", responsible_company: "ardmac", planned_start: d("02-Jun-26"), planned_end: d("03-Jun-26"), planned_manpower: 2, actual_manpower: 0, status: "on_track", blocked_reason: null, blocking_company: null, affects_room: "MER1-LV", cost_per_day: 0 },
  { activity_id: "CX-1450", name: "DUB16-COLO1-MER2-MSB01 FWT", wbs_path: "Off Site Commissioning / FWT", responsible_company: "ardmac", planned_start: d("02-Jun-26"), planned_end: d("03-Jun-26"), planned_manpower: 2, actual_manpower: 0, status: "on_track", blocked_reason: null, blocking_company: null, affects_room: "MER2-LV", cost_per_day: 0 },
  { activity_id: "ELE-COLO-1010", name: "COLO DC 1-4 LV 1st fix containment", wbs_path: "COLO 1-4 LV", responsible_company: "ardmac", planned_start: d("16-Feb-26"), planned_end: d("01-Apr-26"), planned_manpower: 6, actual_manpower: 6, status: "complete", blocked_reason: null, blocking_company: null, affects_room: null, cost_per_day: 0 },
  { activity_id: "ARC-COLO-1060", name: "HAC system install Modules 1-4", wbs_path: "COLO 1-4 Fit-Out", responsible_company: "dornans", planned_start: d("26-Mar-26"), planned_end: d("30-Apr-26"), planned_manpower: 3, actual_manpower: 3, status: "on_track", blocked_reason: null, blocking_company: null, affects_room: null, cost_per_day: 0 },
  { activity_id: "ARC-COLO-1080", name: "Firestopping penetrations Modules 1-4", wbs_path: "COLO 1-4 Fit-Out", responsible_company: "auto-fire", planned_start: d("29-May-26"), planned_end: d("03-Jun-26"), planned_manpower: 2, actual_manpower: 2, status: "on_track", blocked_reason: null, blocking_company: null, affects_room: null, cost_per_day: 0 },
  { activity_id: "FAB-MER-1110", name: "MER2 Floor and Roof", wbs_path: "DUB16 MER2 Fab", responsible_company: "ardmac", planned_start: d("06-Feb-26"), planned_end: d("20-Feb-26"), planned_manpower: 4, actual_manpower: 0, status: "complete", blocked_reason: null, blocking_company: null, affects_room: "MER2-LV", cost_per_day: 0 },
  ...fillerTasks(),
];

// ~30 filler rows with verbatim activity IDs — mostly on_track/complete so the
// variance card has weight by contrast.
function fillerTasks(): BaselineTask[] {
  const rows: [string, string, string, string, TaskStatus][] = [
    ["ELE-COLO-1020", "COLO LV containment Module 2", "COLO 1-4 LV", "ardmac", "complete"],
    ["ELE-COLO-1040", "COLO LV cable pull Module 3", "COLO 1-4 LV", "ardmac", "on_track"],
    ["ELE-COLO-1060", "COLO LV terminations Module 4", "COLO 1-4 LV", "ardmac", "on_track"],
    ["ELE-COLO-1070", "COLO power distribution checks", "COLO 1-4 LV", "ardmac", "on_track"],
    ["ELE-COLO-1090", "COLO small power first fix", "COLO 1-4 Electrical", "cental", "on_track"],
    ["ELE-COLO-1100", "COLO lighting install", "COLO 1-4 Electrical", "cental", "on_track"],
    ["ELE-COLO-1110", "COLO emergency lighting", "COLO 1-4 Electrical", "cental", "on_track"],
    ["ELE-COLO-1130", "COLO containment second fix", "COLO 1-4 Electrical", "t-bourke", "on_track"],
    ["MEC-COLO-1000", "COLO chilled water mains", "Mechanical Modules 1-4", "ardmac", "complete"],
    ["MEC-COLO-1010", "COLO pipework first fix", "Mechanical Modules 1-4", "ardmac", "on_track"],
    ["MEC-COLO-1020", "COLO valve sets install", "Mechanical Modules 1-4", "ardmac", "on_track"],
    ["MEC-COLO-1050", "COLO CRAH connections", "Mechanical Modules 1-4", "t-bourke", "on_track"],
    ["MEC-COLO-1060", "COLO leak detection", "Mechanical Modules 1-4", "ardmac", "on_track"],
    ["ARC-ADMIN-1000", "Admin drywall partitions", "Admin Fit-Out", "dornans", "complete"],
    ["ARC-ADMIN-1040", "Admin ceiling grid", "Admin Fit-Out", "dornans", "on_track"],
    ["ARC-ADMIN-1080", "Admin floor finishes", "Admin Fit-Out", "dornans", "on_track"],
    ["ARC-ADMIN-1140", "Admin door frames", "Admin Fit-Out", "dornans", "on_track"],
    ["FAB-COLO-1080", "COLO external cladding bay 1", "COLO Cladding", "ardmac", "complete"],
    ["FAB-COLO-1120", "COLO external cladding bay 2", "COLO Cladding", "ardmac", "on_track"],
    ["FAB-COLO-1190", "COLO roof membrane", "COLO Cladding", "ardmac", "on_track"],
    ["CX-1110", "DUB16-COLO1-AHU01 FAT", "Off Site Commissioning / FAT", "ardmac", "on_track"],
    ["CX-1130", "DUB16-COLO1-AHU02 FAT", "Off Site Commissioning / FAT", "ardmac", "on_track"],
    ["CX-1150", "DUB16-COLO1-PDU01 FAT", "Off Site Commissioning / FAT", "ardmac", "complete"],
    ["CX-1230", "DUB16-COLO1-PDU02 FWT", "Off Site Commissioning / FWT", "ardmac", "on_track"],
    ["PRO-1140", "Admin AHU procurement", "Procurement Admin", "ardmac", "complete"],
    ["PRO-1160", "Admin switchgear procurement", "Procurement Admin", "ardmac", "on_track"],
    ["PRO-1170", "Admin UPS procurement", "Procurement Admin", "ardmac", "on_track"],
    ["PRO-1190", "Admin cabling procurement", "Procurement Admin", "ardmac", "complete"],
    ["SEC-COLO-1010", "Security cable containment", "Security COLO & ADMIN", "ardmac", "on_track"],
    ["SEC-COLO-1030", "Security camera first fix", "Security COLO & ADMIN", "auto-fire", "on_track"],
    ["SEC-COLO-1050", "Security access control rough-in", "Security COLO & ADMIN", "auto-fire", "on_track"],
  ];
  return rows.map(([id, name, wbs, company, status]) => ({
    activity_id: id,
    name,
    wbs_path: wbs,
    responsible_company: company,
    planned_start: d("01-Mar-26"),
    planned_end: d("30-Apr-26"),
    planned_manpower: 2 + (id.length % 4),
    actual_manpower: status === "complete" || status === "on_track" ? 2 + (id.length % 3) : 0,
    status,
    blocked_reason: null,
    blocking_company: null,
    affects_room: null,
    cost_per_day: 0,
  }));
}

export const SITE_DIARY = {
  submitted_by: "Johnny McKenna",
  submitted_at_label: "07:42",
  manpower: [
    { men: 1, activity: "modular lighting", company: "cental" },
    { men: 3, activity: "containment", company: "ardmac" },
    { men: 4, activity: "fibre containment", company: "onnec" },
  ],
  notes:
    "Earth bar MER1 still not started. Brackets for fibre runs still missing from Cental. No movement on external lights — Marco still waiting on Lawrence sign-off (3w). Doors and FOK still blocked on Sellafield. Finnings generator A kick-off tomorrow per programme.",
};

// ---------- loadable baseline ----------

export type Blocker = {
  title: string;
  held_by_company: string | null;
  affects_room: string | null;
  days_open: number;
  cost_per_day: number;
  affects_bu: boolean;
};

export type Diary = {
  submitted_by: string;
  submitted_at_label: string;
  manpower: { men: number; activity: string; company: string }[];
  notes: string;
};

export type Baseline = {
  project: { name: string; baseline_revision_date: string };
  companies: Company[];
  rooms: CriticalRoom[];
  tasks: BaselineTask[];
  diary: Diary;
  blockers: Blocker[];
};

// The static May-27 seed — used until a live ingest overrides it.
export const DEFAULT_BASELINE: Baseline = {
  project: { name: "DUB-16 Cx", baseline_revision_date: "2026-04-21" },
  companies: COMPANIES,
  rooms: CRITICAL_ROOMS,
  tasks: BASELINE_TASKS,
  diary: SITE_DIARY,
  blockers: [],
};

const BASELINE_KEY = "keldra_baseline";

// Live ingest writes the merged baseline here; views read it, falling back to
// the static seed. clearBaseline() is the "reset to May-27 seed" demo control.
export function loadBaseline(): Baseline {
  if (typeof window === "undefined") return DEFAULT_BASELINE;
  try {
    const raw = window.localStorage.getItem(BASELINE_KEY);
    if (!raw) return DEFAULT_BASELINE;
    const p = JSON.parse(raw) as Partial<Baseline>;
    return {
      project: p.project ?? DEFAULT_BASELINE.project,
      companies: p.companies?.length ? p.companies : DEFAULT_BASELINE.companies,
      rooms: p.rooms ?? [],
      tasks: p.tasks ?? [],
      diary: p.diary ?? DEFAULT_BASELINE.diary,
      blockers: p.blockers ?? [],
    };
  } catch {
    return DEFAULT_BASELINE;
  }
}

export function saveBaseline(b: Baseline): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
  } catch {
    /* quota — ignore */
  }
}

export function clearBaseline(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BASELINE_KEY);
  } catch {
    /* ignore */
  }
}

export function isIngested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(BASELINE_KEY);
  } catch {
    return false;
  }
}

// ---------- pure helpers (operate on a Baseline) ----------

export function companyBySlug(b: Baseline, slug: string): Company | undefined {
  return b.companies.find((c) => c.slug === slug);
}

export function roomByCode(
  b: Baseline,
  code: string | null,
): CriticalRoom | undefined {
  return code ? b.rooms.find((r) => r.code === code) : undefined;
}

export function companyColour(b: Baseline, slug: string | null): string {
  const c = slug ? companyBySlug(b, slug) : undefined;
  return c ? BRAND[c.colour] : BRAND.inkMuted;
}

export function companyName(b: Baseline, slug: string | null): string {
  return (slug && companyBySlug(b, slug)?.name) || slug || "—";
}

// Working days (Mon–Fri) between today and an ISO target.
export function workingDaysUntil(targetIso: string, from: Date = new Date()): number {
  const end = new Date(targetIso);
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function daysOpen(task: BaselineTask, from: Date = new Date()): number {
  const start = new Date(task.planned_start).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((from.getTime() - start) / 86400000));
}

// A task is BU-affecting if it touches a priority-1 BU room.
export function affectsBu(b: Baseline, task: BaselineTask): boolean {
  const r = roomByCode(b, task.affects_room);
  return !!r && r.priority === 1;
}

// The company "holding up" a task (its blocker, or its owner if simply not
// started). Used for the companies grid.
export function holdingCompany(task: BaselineTask): string | null {
  if (task.status === "blocked") return task.blocking_company;
  if (task.status === "not_started_should_be") return task.responsible_company;
  return null;
}

// Tasks the baseline says should be running today but aren't progressing.
export function varianceTasks(b: Baseline): BaselineTask[] {
  const active = b.tasks.filter(
    (t) => t.status === "blocked" || t.status === "not_started_should_be",
  );
  const rank = (t: BaselineTask): number => {
    const r = roomByCode(b, t.affects_room);
    if (t.status === "blocked" && r?.priority === 1) return 0;
    if (t.status === "not_started_should_be" && r?.priority === 1) return 1;
    if (t.status === "blocked" && (r?.tag === "MMR1" || r?.tag === "MMR2")) return 2;
    return 3;
  };
  return active.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return daysOpen(b) - daysOpen(a);
  });
}

export type CompanyRollup = {
  company: Company;
  totalPerDay: number;
  blockerCount: number;
  buCount: number;
  oldestWeeks: number;
  worstRoom: string | null;
};

// Companies holding things up (excludes the main contractor — Johnny's own org
// — since this board answers "who is holding ME up"). Ranked by £/day.
export function companyRollups(b: Baseline): CompanyRollup[] {
  const map = new Map<string, BaselineTask[]>();
  for (const t of b.tasks) {
    const h = holdingCompany(t);
    if (!h) continue;
    const c = companyBySlug(b, h);
    if (!c || c.role === "Main contractor") continue;
    (map.get(h) ?? map.set(h, []).get(h)!).push(t);
  }
  const out: CompanyRollup[] = [];
  for (const [slug, tasks] of map.entries()) {
    const company = companyBySlug(b, slug)!;
    const buTasks = tasks.filter((t) => affectsBu(b, t));
    const oldest = Math.max(...tasks.map((t) => daysOpen(t)), 0);
    const worst = tasks
      .slice()
      .sort((a, b) => b.cost_per_day - a.cost_per_day)[0];
    out.push({
      company,
      totalPerDay: tasks.reduce((s, t) => s + t.cost_per_day, 0),
      blockerCount: tasks.length,
      buCount: buTasks.length,
      oldestWeeks: Math.floor(oldest / 7),
      worstRoom: worst?.affects_room ?? null,
    });
  }
  return out.sort((a, b) => b.totalPerDay - a.totalPerDay);
}

export function taskById(b: Baseline, id: string): BaselineTask | undefined {
  return b.tasks.find((t) => t.activity_id === id);
}

export function tasksForCompany(b: Baseline, slug: string): BaselineTask[] {
  return b.tasks.filter(
    (t) => holdingCompany(t) === slug || t.responsible_company === slug,
  );
}

// Recovery list — everything not progressing, costliest first.
export function recoveryTasks(b: Baseline): BaselineTask[] {
  return b.tasks
    .filter((t) => t.cost_per_day > 0)
    .sort((a, b2) => b2.cost_per_day - a.cost_per_day);
}
