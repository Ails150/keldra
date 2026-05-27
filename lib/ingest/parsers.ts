// One parser per file type → a normalised payload. Sheet-based parsers take a
// pre-read Sheet; XER/PDF take the File.
import type { NormalisedPayload, RawDiary } from "./types";
import type { Sheet } from "./sheet";
import { parseXer } from "@/app/onboarding/lib/xer-parser";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Pull the first matching column value (exact header first, then substring).
function pick(row: Record<string, string>, cands: string[]): string {
  const keys = Object.keys(row);
  for (const c of cands) {
    const exact = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (exact && row[exact]?.trim()) return row[exact].trim();
  }
  for (const c of cands) {
    const fuzzy = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (fuzzy && row[fuzzy]?.trim()) return row[fuzzy].trim();
  }
  return "";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function normaliseDate(s: string): string | undefined {
  const v = (s ?? "").trim();
  if (!v) return undefined;
  // Excel serial date
  if (/^\d{4,6}$/.test(v)) {
    const n = +v;
    if (n > 20000 && n < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + n * 86400000)
        .toISOString()
        .slice(0, 10);
    }
  }
  let m = v.match(/(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return `${y}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

// Best-effort critical-room code from free text (WBS / name / "affects").
export function detectRoomCode(text: string | undefined): string | null {
  const s = (text ?? "").toUpperCase();
  if (!s) return null;
  // BU-prefixed codes map to the priority-1 BU rooms.
  if (s.startsWith("BU-") || /\bBU\b/.test(s)) {
    if (s.includes("FER")) return "BU-FER";
    return "BU-MMR";
  }
  if (s.includes("FER")) return "BU-FER";
  if (s.includes("MMR")) return "MMR1";
  if (s.includes("EARTH")) return "EARTH-M1";
  if (s.includes("MER")) return "MER1-LV";
  if (/SECURITY|\bSOC\b|\bSER\b|\bSEC\b/.test(s)) return "SEC-COLO";
  return null;
}

export function parseP6Csv(sheet: Sheet): NormalisedPayload {
  const tasks: NonNullable<NormalisedPayload["tasks"]> = [];
  let noDate = 0;
  for (const row of sheet.rows) {
    const id = pick(row, ["Activity ID", "Act ID", "ID", "Activity Code"]);
    if (!id) continue;
    const name = pick(row, ["Activity Name", "Task Name", "Description", "Name"]);
    const start = normaliseDate(pick(row, ["Planned Start", "Early Start", "BL Start", "Start"]));
    const finish = normaliseDate(pick(row, ["Planned Finish", "Early Finish", "BL Finish", "Finish"]));
    const wbs = pick(row, ["WBS Path", "WBS Code", "WBS", "Path"]);
    const resource = pick(row, ["Resources", "Resource", "Trade", "Responsible"]);
    if (!start && !finish) noDate++;
    tasks.push({
      activity_id: id,
      name: name || id,
      planned_start: start,
      planned_finish: finish,
      wbs_path: wbs || undefined,
      responsible_company_name: resource || undefined,
    });
  }
  const warnings = noDate ? [`${noDate} activities without dates — kept undated`] : [];
  return { tasks, warnings };
}

export function parseSubReturns(sheet: Sheet): NormalisedPayload {
  const diary: RawDiary[] = [];
  for (const row of sheet.rows) {
    const company = pick(row, ["Company", "Subcontractor", "Sub", "Trade"]);
    const men =
      parseInt(pick(row, ["Men", "Headcount", "Manpower", "Crew", "Number of Workers"]), 10) || 0;
    if (!company || !men) continue;
    diary.push({
      date: normaliseDate(pick(row, ["Date", "Day", "Log Date"])),
      company_name: company,
      task: pick(row, ["Task", "Activity", "Job", "Work Description", "Area"]) || "site works",
      men,
    });
  }
  return { diary, warnings: [] };
}

export const parseProcoreDaily = parseSubReturns;

export function parseBlockerRegister(sheet: Sheet): NormalisedPayload {
  const blockers: NonNullable<NormalisedPayload["blockers"]> = [];
  for (const row of sheet.rows) {
    const title = pick(row, ["Blocker", "Constraint", "Issue", "Title", "Description"]);
    if (!title) continue;
    const opened = normaliseDate(pick(row, ["Date opened", "Raised", "Open date", "Opened"]));
    const daysStr = pick(row, ["Days open", "Age"]);
    const cost =
      parseInt(pick(row, ["£/day", "Cost per day", "Cost/day", "Cost"]).replace(/[^0-9]/g, ""), 10) || 0;
    const bu = pick(row, ["Affects BU?", "BU impact", "BU"]).toLowerCase();
    const days_open = daysStr
      ? parseInt(daysStr, 10) || 0
      : opened
        ? Math.max(0, Math.floor((Date.now() - new Date(opened).getTime()) / 86400000))
        : 0;
    blockers.push({
      title,
      held_by_company_name: pick(row, ["Held by", "Owner", "Holder", "Holding", "Responsible"]) || undefined,
      affects_room_code: detectRoomCode(pick(row, ["Affects", "Room", "Critical room", "Asset", "Area"])) || undefined,
      days_open,
      cost_per_day: cost,
      affects_bu: /^y|true|1/.test(bu),
    });
  }
  return { blockers, warnings: [] };
}

export async function parseP6Xer(file: File): Promise<NormalisedPayload> {
  const x = await parseXer(file);
  const tasks = x.activities.map((a) => ({
    activity_id: a.task_code || a.task_id,
    name: a.task_name || a.task_code,
    planned_start: a.target_start || undefined,
    planned_finish: a.target_end || undefined,
    wbs_path: a.wbs_id || undefined,
  }));
  return {
    project: x.project ? { name: x.project.name } : undefined,
    tasks,
    warnings: tasks.length ? [] : ["No TASK rows found in XER"],
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

export async function parsePdf(file: File): Promise<NormalisedPayload> {
  try {
    const pdf_base64 = await fileToBase64(file);
    const res = await fetch("/api/extract-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_base64 }),
    });
    if (!res.ok) return { tasks: [], warnings: [`PDF extraction failed (HTTP ${res.status})`] };
    const data = await res.json();
    const acts: any[] = Array.isArray(data.activities) ? data.activities : [];
    const tasks = acts
      .filter((a) => a.activity_id)
      .map((a) => ({
        activity_id: String(a.activity_id),
        name: String(a.name ?? a.activity_id),
        planned_start: normaliseDate(String(a.planned_start ?? "")),
        planned_finish: normaliseDate(String(a.planned_finish ?? "")),
        wbs_path: a.wbs_path ? String(a.wbs_path) : undefined,
      }));
    const warnings: string[] = [];
    if (data.source === "ai")
      warnings.push("PDF complex — extracted via AI, verify critical rows.");
    if (!tasks.length) warnings.push("No activities extracted from PDF.");
    return { tasks, warnings };
  } catch (e) {
    return { tasks: [], warnings: [`PDF error: ${(e as Error).message}`] };
  }
}
