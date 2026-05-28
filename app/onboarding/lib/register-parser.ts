// Parses an action register / meeting-minutes spreadsheet (Johnny McKenna's
// DUB-12 security meeting format and friends) into structured constraints.
//
// The Comments column is the gold: each dated line ("DD/MM/YYYY - text") becomes
// a hash-chained event so the project's real history lands in the audit chain.

import * as XLSX from "xlsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RegisterEvent = {
  date: string; // ISO yyyy-mm-dd
  content: string;
  hash: string; // sha-256 of date + content + prev_hash
};

export type ParsedConstraint = {
  item_no: string; // e.g. "1.06"
  description: string;
  date_raised: string; // ISO (or "" if unparseable)
  raised_by: string; // initials or name
  priority: "Critical" | "High" | "Medium" | "Low";
  action_by: string; // e.g. "JM Cundall"
  action_by_org: string; // extracted org, e.g. "Cundall"
  agreed_action_date: string | null;
  status: "OPEN" | "CLOSED" | "AWAITING_INPUT";
  date_closed: string | null;
  comments_raw: string;
  events: RegisterEvent[];
};

export type ParsedRegister = {
  fileName: string;
  rowCount: number;
  eventCount: number;
  dateRange: { from: string; to: string } | null;
  constraints: ParsedConstraint[];
};

// Known orgs we can pull out of an "Action by" string like "JM Cundall".
const KNOWN_ORGS = [
  "Cental",
  "Ardmac",
  "Cundall",
  "Evolution",
  "DEL",
  "Microsoft",
  "Primo",
  "Central",
];

// ---------- sha-256 (Web Crypto, with a deterministic SSR/test fallback) ----------

async function sha256(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(s),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
}

// ---------- date parsing (DD/MM/YYYY, ISO, Excel serials, JS Dates) ----------

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}`;
}

// Returns ISO yyyy-mm-dd, or null when the value isn't a recognisable date.
export function parseFlexibleDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toIso(value);
  }

  // Excel stores dates as serial numbers (days since 1899-12-30).
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 1 || value > 200000) return null; // not a plausible date serial
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    return toIso(new Date(ms));
  }

  const s = value.toString().trim();
  if (!s) return null;

  // ISO-ish: 2026-05-22 or 2026/05/22
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${pad(+m)}-${pad(+d)}`;
  }

  // Day-first: 22/05/2026, 22-05-26, 22.5.2026
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy as unknown as [string, string, string, string];
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const day = +d;
    const month = +m;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : toIso(fallback);
}

// ---------- field normalisers ----------

function mapPriority(raw: unknown): ParsedConstraint["priority"] {
  const p = (raw ?? "").toString().trim().toLowerCase();
  if (p.includes("crit")) return "Critical";
  if (p.includes("high")) return "High";
  if (p.includes("low")) return "Low";
  return "Medium";
}

function mapStatus(raw: unknown): ParsedConstraint["status"] {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return "OPEN";
  if (s.includes("closed") || s === "c") return "CLOSED";
  if (s.includes("await") || s.includes("input") || s.includes("hold"))
    return "AWAITING_INPUT";
  return "OPEN";
}

// "JM Cundall" -> "Cundall"; "FL DEL" -> "DEL". Matches a known org anywhere in
// the string (case-insensitive); otherwise falls back to the last word.
function extractOrg(actionBy: string): string {
  const text = (actionBy ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const org of KNOWN_ORGS) {
    if (lower.includes(org.toLowerCase())) return org;
  }
  const words = text.split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : "";
}

// ---------- comments -> events ----------

const LEADING_DATE = /^\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*[-:]/;
const DATE_LOOKAHEAD = /(?=\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*[-:])/;

// Splits a Comments cell into dated chunks. Each "DD/MM/YYYY - text" line starts
// a new event; lines without a leading date are folded into the previous event.
function splitComments(raw: string): { date: string | null; content: string }[] {
  const text = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  // First try splitting on the date pattern (handles both newline-separated and
  // run-together "DD/MM/YYYY - ... DD/MM/YYYY - ..." cells).
  const chunks = text
    .split(DATE_LOOKAHEAD)
    .map((c) => c.trim())
    .filter(Boolean);

  const out: { date: string | null; content: string }[] = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*[-:]\s*([\s\S]*)$/);
    if (m) {
      const date = parseFlexibleDate(m[1]);
      const content = m[2].replace(/\s*\n\s*/g, " ").trim();
      out.push({ date, content });
    } else {
      // Leading prose before the first dated line: attach to the next event if
      // there is one, otherwise keep it as an undated note.
      const content = chunk.replace(/\s*\n\s*/g, " ").trim();
      if (content) out.push({ date: null, content });
    }
  }
  return out;
}

async function buildEvents(
  comments_raw: string,
  fallbackDate: string,
): Promise<RegisterEvent[]> {
  const parsed = splitComments(comments_raw);
  const lines =
    parsed.length > 0
      ? parsed
      : comments_raw.trim()
        ? [{ date: null, content: comments_raw.trim() }]
        : [];

  const events: RegisterEvent[] = [];
  let prevHash = "";
  for (const line of lines) {
    const date = line.date ?? fallbackDate ?? "";
    const content = line.content;
    const hash = await sha256(date + content + prevHash);
    events.push({ date, content, hash });
    prevHash = hash;
  }
  return events;
}

// ---------- header detection ----------

type ColMap = Partial<Record<keyof ParsedConstraint | "comments", number>>;

function buildColMap(headerRow: any[]): ColMap {
  const map: ColMap = {};
  headerRow.forEach((cell, idx) => {
    const h = (cell ?? "").toString().trim().toLowerCase();
    if (!h) return;
    // Order matters — check the more specific labels first.
    if (/item\s*(no|#|number)?\b/.test(h) && map.item_no === undefined)
      map.item_no = idx;
    else if (h.includes("description") || h === "desc")
      map.description = idx;
    else if (h.includes("date") && h.includes("raised"))
      map.date_raised = idx;
    else if (h.includes("raised") && h.includes("by")) map.raised_by = idx;
    else if (h.includes("priority")) map.priority = idx;
    else if (h.includes("action") && h.includes("by")) map.action_by = idx;
    else if (h.includes("agreed")) map.agreed_action_date = idx;
    else if (h.includes("date") && h.includes("closed"))
      map.date_closed = idx;
    else if (h === "status" || h.includes("status")) map.status = idx;
    else if (h.includes("comment")) map.comments = idx;
  });
  return map;
}

// Scores how "header-like" a row is, so we can skip title/blurb rows above it.
function headerScore(row: any[]): number {
  const joined = row.map((c) => (c ?? "").toString().toLowerCase()).join(" ");
  let score = 0;
  for (const key of ["item", "description", "status", "priority", "raised", "comment", "action"]) {
    if (joined.includes(key)) score += 1;
  }
  return score;
}

// ---------- main entry ----------

export async function parseActionRegister(file: File): Promise<ParsedRegister> {
  const isCsv = /\.csv$/i.test(file.name);
  let workbook: XLSX.WorkBook;
  if (isCsv) {
    const text = await file.text();
    workbook = XLSX.read(text, { type: "string", cellDates: true });
  } else {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: "array", cellDates: true });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  // Find the header row — scan the first ~15 rows for the most header-like one.
  let headerIdx = 0;
  let best = -1;
  const scanLimit = Math.min(grid.length, 15);
  for (let i = 0; i < scanLimit; i++) {
    const score = headerScore(grid[i] ?? []);
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  }

  const colMap = buildColMap(grid[headerIdx] ?? []);
  const dataRows = grid.slice(headerIdx + 1);

  const get = (row: any[], key: keyof ColMap): string => {
    const idx = colMap[key];
    if (idx === undefined) return "";
    return (row[idx] ?? "").toString().trim();
  };
  const getRaw = (row: any[], key: keyof ColMap): unknown => {
    const idx = colMap[key];
    return idx === undefined ? "" : row[idx];
  };

  const constraints: ParsedConstraint[] = [];
  const allDates: string[] = [];

  for (const row of dataRows) {
    const item_no = get(row, "item_no");
    if (!item_no) continue; // skip blank / spacer rows

    const date_raised = parseFlexibleDate(getRaw(row, "date_raised")) ?? "";
    const date_closed = parseFlexibleDate(getRaw(row, "date_closed"));
    const agreed_action_date = parseFlexibleDate(
      getRaw(row, "agreed_action_date"),
    );
    const action_by = get(row, "action_by");
    const comments_raw = get(row, "comments");

    const events = await buildEvents(comments_raw, date_raised);

    constraints.push({
      item_no,
      description: get(row, "description"),
      date_raised,
      raised_by: get(row, "raised_by"),
      priority: mapPriority(getRaw(row, "priority")),
      action_by,
      action_by_org: extractOrg(action_by),
      agreed_action_date,
      status: mapStatus(getRaw(row, "status")),
      date_closed,
      comments_raw,
      events,
    });

    if (date_raised) allDates.push(date_raised);
    if (date_closed) allDates.push(date_closed);
    events.forEach((e) => e.date && allDates.push(e.date));
  }

  allDates.sort();
  const dateRange =
    allDates.length > 0
      ? { from: allDates[0], to: allDates[allDates.length - 1] }
      : null;

  const eventCount = constraints.reduce((n, c) => n + c.events.length, 0);

  return {
    fileName: file.name,
    rowCount: constraints.length,
    eventCount,
    dateRange,
    constraints,
  };
}

// Builds a lightweight ParsedRegister from an already-parsed constraint-log
// (id / description / raised_date / ... rows). Used by the "Load DUB-12 sample"
// button so the 4th upload card has a populated done-state without a real
// spreadsheet. Each constraint contributes one hash-chained "raised" event.
export async function buildRegisterFromConstraintRows(
  fileName: string,
  rows: any[],
): Promise<ParsedRegister> {
  const constraints: ParsedConstraint[] = [];
  const allDates: string[] = [];
  let prevHash = "";

  for (const row of rows) {
    const item_no = (row?.id ?? "").toString().trim();
    if (!item_no) continue;
    const description = (row?.description ?? "").toString().trim();
    const raised_by = (row?.raised_by ?? "").toString().trim();
    const date_raised = parseFlexibleDate(row?.raised_date) ?? "";
    const action_by = (row?.owner_name ?? "").toString().trim();
    const action_by_org =
      (row?.owner_org ?? "").toString().trim() || extractOrg(action_by);
    const agreed_action_date = parseFlexibleDate(row?.deadline);
    const status = mapStatus(row?.status);

    const content = `${raised_by || "—"} raised: ${description}`;
    const hash = await sha256(date_raised + content + prevHash);
    prevHash = hash;

    constraints.push({
      item_no,
      description,
      date_raised,
      raised_by,
      priority: mapPriority(row?.priority),
      action_by,
      action_by_org,
      agreed_action_date,
      status,
      date_closed: null,
      comments_raw: "",
      events: [{ date: date_raised, content, hash }],
    });

    if (date_raised) allDates.push(date_raised);
    if (agreed_action_date) allDates.push(agreed_action_date);
  }

  allDates.sort();
  const dateRange =
    allDates.length > 0
      ? { from: allDates[0], to: allDates[allDates.length - 1] }
      : null;

  return {
    fileName,
    rowCount: constraints.length,
    eventCount: constraints.reduce((n, c) => n + c.events.length, 0),
    dateRange,
    constraints,
  };
}

// Maps parsed constraints into the constraint-log row shape the dashboard
// hydrates (see lib/blocker-state.ts hydrateFromProject). Each row carries its
// parsed comment events so they expand into the hash chain.
export function registerToConstraintRows(parsed: ParsedRegister): any[] {
  return parsed.constraints.map((c) => ({
    id: c.item_no,
    description: c.description,
    raised_date: c.date_raised,
    raised_by: c.raised_by,
    owner_name: c.action_by,
    owner_org: c.action_by_org,
    priority: c.priority,
    status: c.status,
    linked_assets: "",
    deadline: c.agreed_action_date ?? "",
    comments_raw: c.comments_raw,
    comment_events: c.events.map((e) => ({ date: e.date, content: e.content })),
  }));
}
