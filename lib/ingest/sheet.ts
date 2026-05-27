// Reads a spreadsheet (.xlsx/.xls via SheetJS, .csv via PapaParse) into a header
// row + keyed rows. Runs client-side.
import * as XLSX from "xlsx";
import Papa from "papaparse";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Sheet = { header: string[]; rows: Record<string, string>[] };

export async function readSheet(file: File): Promise<Sheet> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    return {
      header: parsed.meta.fields ?? [],
      rows: (parsed.data as Record<string, string>[]) ?? [],
    };
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // Header = first row with >= 2 non-empty cells (skips title rows).
  let hi = 0;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if ((aoa[i] ?? []).filter((c) => String(c).trim()).length >= 2) {
      hi = i;
      break;
    }
  }
  const header = (aoa[hi] ?? []).map((c) => String(c).trim());
  const rows = aoa.slice(hi + 1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, j) => (o[h] = String(r[j] ?? "").trim()));
    return o;
  });
  return { header, rows };
}

// First ~4KB of a file as text — for XER token sniffing and PDF presence.
export async function readSample(file: File): Promise<string> {
  try {
    const slice = file.slice(0, 4096);
    return await slice.text();
  } catch {
    return "";
  }
}
