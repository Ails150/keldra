import type { BrandColour } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  saveBaseline,
  type Baseline,
  type BaselineTask,
  type Company,
  type CriticalRoom,
  type RoomTag,
  type TaskStatus,
} from "@/app/dashboard/lib/baseline-seed";
import { detect } from "./detect";
import { readSample, readSheet } from "./sheet";
import {
  detectRoomCode,
  parseBlockerRegister,
  parseP6Csv,
  parseP6Xer,
  parsePdf,
  parseProcoreDaily,
  parseSubReturns,
} from "./parsers";
import type { Detection, DetectedType, NormalisedPayload } from "./types";

const PALETTE: BrandColour[] = [
  "coral", "blue", "amber", "pink", "teal", "green", "slate", "navy",
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// The dashboard shell gates on a stored project. After a fresh ingest there may
// be none, so seed a minimal one (Today/Funnel read the baseline override).
function ensureProjectShell(name: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("keldra_demo_project")) return;
    const shell = {
      phase: null,
      org: { name: "Ardmac", type: "main-contractor", colour: "#8a3dd6" },
      project: {
        name,
        client: "Microsoft",
        sector: "",
        startDate: "",
        handoverDate: "",
        buildType: null,
        location: "",
      },
      otherOrgs: [],
      template: "ardmac-red-tag",
      uploads: { team: [], assets: [], constraints: [], register: null, xer: null },
      invites: [],
      viewingAs: {
        orgName: "Ardmac",
        orgType: "main-contractor",
        role: "main-contractor",
      },
    };
    window.localStorage.setItem("keldra_demo_project", JSON.stringify(shell));
  } catch {
    /* ignore */
  }
}

// Read just enough of a file to detect its type.
export async function analyzeFile(
  file: File,
): Promise<{ file: File; detection: Detection }> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  let header: string[] = [];
  let sample = "";
  if (ext === "xer" || ext === "pdf") {
    sample = await readSample(file);
  } else {
    try {
      header = (await readSheet(file)).header;
    } catch {
      /* unreadable — detection falls through to unknown */
    }
  }
  return { file, detection: detect(file.name, header, sample) };
}

async function parseByType(file: File, type: DetectedType): Promise<NormalisedPayload> {
  switch (type) {
    case "p6_xer":
      return parseP6Xer(file);
    case "pdf_programme":
      return parsePdf(file);
    case "p6_csv":
      return parseP6Csv(await readSheet(file));
    case "sub_returns":
      return parseSubReturns(await readSheet(file));
    case "procore_daily":
      return parseProcoreDaily(await readSheet(file));
    case "blocker_register":
      return parseBlockerRegister(await readSheet(file));
    default:
      return { warnings: [`Skipped ${file.name} — unknown type`] };
  }
}

function computeStatus(start?: string, finish?: string): TaskStatus {
  const now = Date.now();
  const s = start ? new Date(start).getTime() : NaN;
  const f = finish ? new Date(finish).getTime() : NaN;
  // No actuals in a raw schedule — anything whose finish is already past is
  // "should be done / running" variance.
  if (!Number.isNaN(f) && f < now) return "not_started_should_be";
  if (!Number.isNaN(s) && s < now && (Number.isNaN(f) || f >= now)) return "on_track";
  return "on_track";
}

export type IngestResult = {
  success: boolean;
  stats: {
    companies_added: number;
    critical_rooms: number;
    baseline_tasks: number;
    site_diary_entries: number;
    blockers: number;
    files_processed: number;
    warnings: string[];
  };
};

function merge(payloads: NormalisedPayload[]): {
  baseline: Baseline;
  companiesAdded: number;
  warnings: string[];
} {
  const warnings = payloads.flatMap((p) => p.warnings ?? []);

  // Start from the seed skeleton (BU rooms + known companies keep their
  // colours / punch lines); new entities are appended.
  const companies: Company[] = DEFAULT_BASELINE.companies.map((c) => ({ ...c }));
  const seedCount = companies.length;
  const rooms: CriticalRoom[] = DEFAULT_BASELINE.rooms.map((r) => ({ ...r }));

  function ensureCompany(name: string): string {
    const lower = name.toLowerCase();
    const existing = companies.find(
      (c) =>
        c.name.toLowerCase() === lower ||
        c.slug === slugify(name) ||
        c.name.toLowerCase().includes(lower) ||
        lower.includes(c.name.toLowerCase()),
    );
    if (existing) return existing.slug;
    const slug = slugify(name) || `co-${companies.length}`;
    companies.push({
      slug,
      name,
      role: "Subcontractor",
      colour: PALETTE[companies.length % PALETTE.length],
    });
    return slug;
  }

  function ensureRoom(code: string, tag: RoomTag = "BU") {
    if (!rooms.find((r) => r.code === code)) {
      rooms.push({ code, name: code, tag, target: "02-Dec-26", priority: 1 });
    }
  }

  const tasks: BaselineTask[] = [];
  let blkSeq = 0;

  for (const p of payloads) {
    for (const t of p.tasks ?? []) {
      const company = t.responsible_company_name
        ? ensureCompany(t.responsible_company_name)
        : "ardmac";
      const room = detectRoomCode(t.wbs_path) ?? detectRoomCode(t.name);
      if (room) ensureRoom(room);
      tasks.push({
        activity_id: t.activity_id,
        name: t.name,
        wbs_path: t.wbs_path ?? "",
        responsible_company: company,
        planned_start: t.planned_start ?? "",
        planned_end: t.planned_finish ?? "",
        planned_manpower: t.planned_manpower ?? 0,
        actual_manpower: 0,
        status: computeStatus(t.planned_start, t.planned_finish),
        blocked_reason: null,
        blocking_company: null,
        affects_room: room,
        cost_per_day: 0,
      });
    }
    for (const b of p.blockers ?? []) {
      const company = b.held_by_company_name
        ? ensureCompany(b.held_by_company_name)
        : null;
      if (b.affects_room_code) ensureRoom(b.affects_room_code);
      tasks.push({
        activity_id: `BLK-${String(++blkSeq).padStart(3, "0")}`,
        name: b.title,
        wbs_path: "Blocker register",
        responsible_company: company ?? "ardmac",
        planned_start: "",
        planned_end: "",
        planned_manpower: 0,
        actual_manpower: 0,
        status: "blocked",
        blocked_reason: b.title,
        blocking_company: company,
        affects_room: b.affects_room_code ?? null,
        cost_per_day: b.cost_per_day ?? 0,
      });
    }
  }

  // Dedupe tasks by activity_id (last file wins).
  const taskMap = new Map<string, BaselineTask>();
  for (const t of tasks) {
    if (taskMap.has(t.activity_id))
      warnings.push(`Duplicate activity ${t.activity_id} — kept latest`);
    taskMap.set(t.activity_id, t);
  }
  const finalTasks = [...taskMap.values()];

  // Diary from sub returns / procore.
  const diaryRows = payloads.flatMap((p) => p.diary ?? []);
  let diary = DEFAULT_BASELINE.diary;
  if (diaryRows.length) {
    diary = {
      submitted_by: "Site diary import",
      submitted_at_label: "today",
      manpower: diaryRows.map((d) => ({
        men: d.men,
        activity: d.task,
        company: ensureCompany(d.company_name),
      })),
      notes: `${diaryRows.length} manpower line${diaryRows.length === 1 ? "" : "s"} imported.`,
    };
  }

  const blockers = payloads.flatMap((p) =>
    (p.blockers ?? []).map((b) => ({
      title: b.title,
      held_by_company: b.held_by_company_name
        ? ensureCompany(b.held_by_company_name)
        : null,
      affects_room: b.affects_room_code ?? null,
      days_open: b.days_open ?? 0,
      cost_per_day: b.cost_per_day ?? 0,
      affects_bu: !!b.affects_bu,
    })),
  );

  const project = {
    name:
      payloads.find((p) => p.project?.name)?.project?.name ??
      DEFAULT_BASELINE.project.name,
    baseline_revision_date: DEFAULT_BASELINE.project.baseline_revision_date,
  };

  return {
    baseline: { project, companies, rooms, tasks: finalTasks, diary, blockers },
    companiesAdded: companies.length - seedCount,
    warnings,
  };
}

export async function runIngest(
  items: { file: File; type: DetectedType }[],
): Promise<IngestResult> {
  const payloads: NormalisedPayload[] = [];
  for (const it of items) {
    try {
      payloads.push(await parseByType(it.file, it.type));
    } catch (e) {
      payloads.push({ warnings: [`Couldn't parse ${it.file.name} — ${(e as Error).message}`] });
    }
  }

  const { baseline, companiesAdded, warnings } = merge(payloads);
  saveBaseline(baseline);
  ensureProjectShell(baseline.project.name);

  return {
    success: true,
    stats: {
      companies_added: companiesAdded,
      critical_rooms: baseline.rooms.length,
      baseline_tasks: baseline.tasks.length,
      site_diary_entries: baseline.diary.manpower.length,
      blockers: baseline.blockers.length,
      files_processed: items.length,
      warnings,
    },
  };
}
