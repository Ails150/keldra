// Parses a Primavera P6 .xer export (plain-text, tab-delimited, multi-table).
//
// Structure: tables are introduced by "%T <TABLE>", their columns by a "%F"
// header row, and each record by a "%R" row. We always resolve columns by NAME
// (never index) because column ordering varies across P6 versions, and default
// missing columns to null/empty. Files over 5MB are streamed line-by-line.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type XerActivityStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type XerActivity = {
  task_id: string;
  task_code: string;
  task_name: string;
  target_start: string | null;
  target_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  complete_pct: number;
  status: XerActivityStatus;
  is_critical: boolean;
  wbs_id: string | null;
};

export type XerRelationship = {
  from: string;
  to: string;
  type: string;
  lag_hours: number;
};

export type XerWbs = { id: string; parent_id: string | null; name: string };

export type ParsedXer = {
  fileName: string;
  project: {
    id: string;
    name: string;
    planStart: string | null;
    planEnd: string | null;
  } | null;
  activities: XerActivity[];
  relationships: XerRelationship[];
  wbs: XerWbs[];
  stats: {
    activityCount: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    criticalCount: number;
    slippingCount: number;
  };
};

// ---------- date handling ----------

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Primavera dates look like "2026-09-04 08:00". Normalise to ISO yyyy-mm-dd.
function xerDate(value: unknown): string | null {
  const s = (value ?? "").toString().trim();
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? null
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function num(value: unknown): number {
  const n = parseFloat((value ?? "").toString());
  return Number.isFinite(n) ? n : 0;
}

// ---------- table walk ----------

const WANTED = new Set(["PROJECT", "TASK", "TASKPRED", "PROJWBS"]);

type WalkCtx = {
  table: string | null;
  header: string[];
  rows: Record<string, Record<string, string>[]>;
};

function processLine(line: string, ctx: WalkCtx): void {
  if (!line) return;
  const parts = line.split("\t");
  const marker = parts[0];

  if (marker === "%T") {
    ctx.table = (parts[1] ?? "").trim();
    ctx.header = [];
    return;
  }
  if (!ctx.table || !WANTED.has(ctx.table)) return;

  if (marker === "%F") {
    ctx.header = parts.slice(1).map((s) => s.trim());
    return;
  }
  if (marker === "%R") {
    const values = parts.slice(1);
    const row: Record<string, string> = {};
    for (let i = 0; i < ctx.header.length; i++) {
      row[ctx.header[i]] = (values[i] ?? "").trim();
    }
    (ctx.rows[ctx.table] ??= []).push(row);
  }
}

async function* streamLines(file: File): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
    }
  }
  buf += decoder.decode();
  if (buf) yield buf.replace(/\r$/, "");
}

// ---------- finalisation ----------

function deriveStatus(row: Record<string, string>): XerActivityStatus {
  const actEnd = row.act_end_date?.trim();
  const actStart = row.act_start_date?.trim();
  const code = (row.status_code ?? "").trim();
  if (actEnd) return "COMPLETE";
  if (actStart) return "IN_PROGRESS";
  if (code === "TK_Complete") return "COMPLETE";
  if (code === "TK_Active") return "IN_PROGRESS";
  return "NOT_STARTED";
}

function isCritical(row: Record<string, string>): boolean {
  const code = (row.status_code ?? "").trim();
  if (code === "TK_Critical") return true;
  const floatRaw = row.total_float_hr_cnt;
  if (floatRaw !== undefined && floatRaw !== "") {
    const f = parseFloat(floatRaw);
    if (Number.isFinite(f) && f <= 0) return true;
  }
  return (row.driving_path_flag ?? "").trim() === "Y";
}

export async function parseXer(file: File): Promise<ParsedXer> {
  const ctx: WalkCtx = { table: null, header: [], rows: {} };

  if (file.size > 5 * 1024 * 1024 && typeof file.stream === "function") {
    for await (const line of streamLines(file)) processLine(line, ctx);
  } else {
    const text = await file.text();
    for (const line of text.split(/\r?\n/)) processLine(line, ctx);
  }

  const projectRow = (ctx.rows.PROJECT ?? [])[0];
  const project = projectRow
    ? {
        id: (projectRow.proj_id ?? "").trim(),
        name: (
          projectRow.proj_short_name ||
          projectRow.proj_name ||
          "Project"
        ).trim(),
        planStart: xerDate(projectRow.plan_start_date),
        planEnd: xerDate(
          projectRow.plan_end_date ?? projectRow.scd_end_date,
        ),
      }
    : null;

  const todayIso = xerDate(new Date().toISOString())!;

  const activities: XerActivity[] = (ctx.rows.TASK ?? []).map((row) => {
    const status = deriveStatus(row);
    const target_end = xerDate(row.target_end_date);
    const actual_end = xerDate(row.act_end_date);
    return {
      task_id: (row.task_id ?? "").trim(),
      task_code: (row.task_code ?? "").trim(),
      task_name: (row.task_name ?? "").trim(),
      target_start: xerDate(row.target_start_date),
      target_end,
      actual_start: xerDate(row.act_start_date),
      actual_end,
      complete_pct: num(row.complete_pct ?? row.phys_complete_pct),
      status,
      is_critical: isCritical(row),
      wbs_id: (row.wbs_id ?? "").trim() || null,
    };
  });

  const relationships: XerRelationship[] = (ctx.rows.TASKPRED ?? []).map(
    (row) => ({
      from: (row.pred_task_id ?? "").trim(),
      to: (row.task_id ?? "").trim(),
      type: (row.pred_type ?? "").trim(),
      lag_hours: num(row.lag_hr_cnt),
    }),
  );

  const wbs: XerWbs[] = (ctx.rows.PROJWBS ?? []).map((row) => ({
    id: (row.wbs_id ?? "").trim(),
    parent_id: (row.parent_wbs_id ?? "").trim() || null,
    name: (row.wbs_name ?? "").trim(),
  }));

  const completedCount = activities.filter((a) => a.status === "COMPLETE").length;
  const inProgressCount = activities.filter(
    (a) => a.status === "IN_PROGRESS",
  ).length;
  const notStartedCount = activities.filter(
    (a) => a.status === "NOT_STARTED",
  ).length;
  const criticalCount = activities.filter((a) => a.is_critical).length;
  const slippingCount = activities.filter((a) => isSlipping(a, todayIso)).length;

  return {
    fileName: file.name,
    project,
    activities,
    relationships,
    wbs,
    stats: {
      activityCount: activities.length,
      completedCount,
      inProgressCount,
      notStartedCount,
      criticalCount,
      slippingCount,
    },
  };
}

// ---------- shared helpers (used by dashboard views) ----------

// Slipping = finished late, OR not finished and already past its planned end.
export function isSlipping(
  a: XerActivity,
  todayIso: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (a.actual_end && a.target_end && a.actual_end > a.target_end) return true;
  if (a.status !== "COMPLETE" && a.target_end && a.target_end < todayIso)
    return true;
  return false;
}

// Whole days an activity has slipped vs its baseline (0 if on track / ahead).
export function slipDays(
  a: XerActivity,
  today: Date = new Date(),
): number {
  if (!a.target_end) return 0;
  const target = new Date(a.target_end).getTime();
  const ref =
    a.status === "COMPLETE" && a.actual_end
      ? new Date(a.actual_end).getTime()
      : today.getTime();
  const d = Math.floor((ref - target) / 86400000);
  return d > 0 ? d : 0;
}

// Index activities by task_code for asset → activity lookups.
export function xerByCode(xer: ParsedXer | null): Map<string, XerActivity> {
  const m = new Map<string, XerActivity>();
  if (xer) {
    for (const a of xer.activities) {
      if (a.task_code) m.set(a.task_code, a);
    }
  }
  return m;
}
