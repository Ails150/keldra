import type { Detection } from "./types";

function ext(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

// How many of `tokens` appear in the header (case-insensitive, substring).
function count(header: string[], tokens: string[]): number {
  const low = header.map((h) => h.toLowerCase());
  return tokens.filter((t) => low.some((h) => h.includes(t.toLowerCase()))).length;
}

// Pure detection. Caller supplies header cells (for spreadsheets/CSV) and a
// raw text sample (first bytes — for XER token sniffing).
export function detect(
  fileName: string,
  header: string[],
  sample: string,
): Detection {
  const e = ext(fileName);

  // Rule 1 — P6 XER
  if (e === "xer" || /ERMHDR|PROJWBS/.test(sample)) {
    return { detected_type: "p6_xer", confidence: 0.95, hints: ["XER markers (ERMHDR / PROJWBS)"] };
  }

  // Rule 6 — PDF (before sheet rules; needs extraction)
  if (e === "pdf") {
    return { detected_type: "pdf_programme", confidence: 0.6, hints: ["PDF — extract via AI"] };
  }

  // Rule 2 — P6 CSV/Excel
  const p6 = count(header, [
    "Activity ID", "Activity Name", "Start", "Finish", "WBS", "Resource",
    "Original Duration", "Total Float",
  ]);
  if (p6 >= 3) {
    return { detected_type: "p6_csv", confidence: 0.9, hints: [`${p6} P6 columns matched`] };
  }

  // Rule 3 — Sub returns
  const sub = count(header, ["Company", "Sub", "Men", "Headcount", "Manpower", "Foreman", "Crew"]);
  const hasDate = count(header, ["Date", "Day"]) > 0;
  if (sub >= 2 || (sub >= 1 && hasDate)) {
    return { detected_type: "sub_returns", confidence: 0.85, hints: ["Company / manpower columns"] };
  }

  // Rule 4 — Blocker register
  const blk = count(header, [
    "Blocker", "Constraint", "Issue", "Held by", "Owner", "Holder", "Affects",
    "Date opened", "Days open", "Cost", "£/day",
  ]);
  if (blk >= 2) {
    return { detected_type: "blocker_register", confidence: 0.85, hints: ["Blocker / cost columns"] };
  }

  // Rule 5 — Procore daily log
  const pro = count(header, [
    "Log Date", "Project Name", "Daily Log", "Manpower Log", "Workforce",
    "Subcontractor", "Number of Workers", "Work Description",
  ]);
  if (e === "csv" && pro >= 2) {
    return { detected_type: "procore_daily", confidence: 0.85, hints: ["Procore log columns"] };
  }

  return { detected_type: "unknown", confidence: 0, hints: [] };
}
