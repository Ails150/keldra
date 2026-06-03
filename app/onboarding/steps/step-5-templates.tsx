"use client";

import Papa from "papaparse";
import { useState, type ChangeEvent } from "react";
import type { StepProps } from "../types";
import {
  buildRegisterFromConstraintRows,
  parseActionRegister,
  registerToConstraintRows,
  type ParsedConstraint,
  type ParsedRegister,
} from "../lib/register-parser";
import {
  MER_ASSETS_CSV,
  MER_CONSTRAINTS_CSV,
  MER_TEAM_CSV,
} from "../sample-data/dub16";
import { parseXer, type ParsedXer } from "../lib/xer-parser";
import { BLD_XER } from "../sample-data/dub12-xer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TEMPLATES = [
  {
    id: "main-contractor-red-tag",
    name: "Main Contractor Red Tag v1",
    description: "Main Contractor's MEP commissioning pipeline. Asset-level red/yellow/green tagging with ready-criteria gates.",
    stages: ["Designed", "Delivered", "Installed", "Red-tag candidate", "Red-tagged", "Yellow", "Green"],
    recommended: true,
  },
  {
    id: "hyperscaler-cx-standard",
    name: "Hyperscaler Cx Standard",
    description: "Generic data-centre commissioning template. Asset register + FOK criteria + IST/L5 sign-off.",
    stages: ["Designed", "Procured", "Installed", "Cold Cx", "Hot Cx", "IST", "L5 sign-off"],
    recommended: false,
  },
  {
    id: "modular-plant-room",
    name: "Modular Plant Room v1",
    description: "For skid-delivered MEP. Factory test → site ctelecoms-subt → commissioning → handover.",
    stages: ["Designed", "Factory tested", "Delivered", "Sited", "Ctelecoms-subted", "Commissioned", "Handed over"],
    recommended: false,
  },
  {
    id: "custom",
    name: "Build your own",
    description: "Start from a blank stage chain and add your own stages, criteria and tags later.",
    stages: ["Custom stages — set up after onboarding"],
    recommended: false,
  },
];

type UploadKey = "team" | "assets" | "constraints";

type UploadCardDef = {
  key: UploadKey;
  title: string;
  subtitle: string;
  countFn: (rows: any[]) => string;
};

const UPLOAD_CARDS: UploadCardDef[] = [
  {
    key: "team",
    title: "Team roster",
    subtitle: "People, roles, org assignments",
    countFn: (rows) => `${rows.length} people imported`,
  },
  {
    key: "assets",
    title: "Asset register",
    subtitle: "Equipment list with tags + locations",
    countFn: (rows) => `${rows.length} assets imported`,
  },
  {
    key: "constraints",
    title: "Constraint log",
    subtitle: "Open items, blockers, dependencies",
    countFn: (rows) => {
      const unclear = rows.filter(isBlankOwner).length;
      return `${rows.length} · ${unclear} unclear owner`;
    },
  },
];

function isBlankOwner(row: any): boolean {
  const v = (row?.owner_name ?? "").toString().trim();
  return v === "";
}

function stageBadgeClasses(stage: string): string {
  const s = (stage || "").toLowerCase().trim();
  if (!s) return "bg-paper-warm text-ink-mid";
  if (s.includes("delivered") && s.includes("not installed"))
    return "bg-zinc-200 text-zinc-700";
  if (s.includes("green") || s.includes("handed over") || s.includes("handover"))
    return "bg-green-100 text-green-800";
  if (s.includes("yellow")) return "bg-yellow-100 text-yellow-800";
  if (s.includes("red")) return "bg-red-100 text-red-700";
  return "bg-paper-warm text-ink-mid";
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function UploadIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SpreadsheetIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 13v4M12 13v4" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function registerStatusClasses(status: string): string {
  if (status === "CLOSED") return "bg-green-100 text-green-800";
  if (status === "AWAITING_INPUT") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-700"; // OPEN
}

function daysOpen(c: ParsedConstraint): number {
  if (!c.date_raised) return 0;
  const start = new Date(c.date_raised).getTime();
  if (Number.isNaN(start)) return 0;
  const end =
    c.status === "CLOSED" && c.date_closed
      ? new Date(c.date_closed).getTime()
      : Date.now();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Step5Templates({ formData, setFormData }: StepProps) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [xerError, setXerError] = useState<string | null>(null);

  function handleFile(key: UploadKey, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setFormData((prev) => ({
          ...prev,
          uploads: { ...prev.uploads, [key]: result.data as any[] },
        }));
      },
    });
    // reset so same file can be re-picked
    e.target.value = "";
  }

  // Merge register-derived constraint rows into uploads.constraints (de-duped by
  // Item No) so every parsed row also shows up on the dashboard as a blocker.
  function absorbRegister(parsed: ParsedRegister) {
    const rows = registerToConstraintRows(parsed);
    setFormData((prev) => {
      const existing = prev.uploads.constraints ?? [];
      const existingIds = new Set(
        existing.map((r: any) => (r?.id ?? "").toString()),
      );
      const merged = [
        ...existing,
        ...rows.filter((r) => !existingIds.has(r.id)),
      ];
      return {
        ...prev,
        uploads: { ...prev.uploads, register: parsed, constraints: merged },
      };
    });
  }

  async function handleRegisterFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await parseActionRegister(file);
      if (parsed.rowCount === 0) {
        setParseError(
          "No rows with an Item No were found — check the file has an Item No / Description / Status header row.",
        );
        return;
      }
      absorbRegister(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : "Could not read that file. Try a .xlsx or .csv export.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function handleXerFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setXerError(null);
    try {
      const xer = await parseXer(file);
      if (xer.activities.length === 0) {
        setXerError(
          "No activities found — make sure this is a P6 XER export with a TASK table.",
        );
        return;
      }
      setFormData((prev) => ({
        ...prev,
        uploads: { ...prev.uploads, xer },
      }));
    } catch {
      setXerError("Could not read that file. Export it from P6 as .xer.");
    } finally {
      setParsing(false);
    }
  }

  function parseCsv(csv: string): any[] {
    return Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    }).data as any[];
  }

  // Auto-fills all four uploads with the BLD sample so the demo can run
  // without manually dropping files. Builds a register from the constraint log
  // so the 4th card lands in its done-state too.
  async function loadDub16Sample() {
    setParsing(true);
    setParseError(null);
    try {
      const team = parseCsv(MER_TEAM_CSV);
      const assets = parseCsv(MER_ASSETS_CSV);
      const constraints = parseCsv(MER_CONSTRAINTS_CSV);
      const register = await buildRegisterFromConstraintRows(
        "dub16-constraint-log.csv",
        constraints,
      );
      const xer = await parseXer(
        new File([BLD_XER], "BLD_Building_4.xer"),
      );
      setFormData((prev) => ({
        ...prev,
        project: {
          ...prev.project,
          name: prev.project.name?.trim() ? prev.project.name : "MER Cx",
          client: prev.project.client?.trim() ? prev.project.client : "Hyperscale Client",
        },
        template: prev.template ?? "main-contractor-red-tag",
        uploads: { team, assets, constraints, register, xer },
      }));
    } catch {
      setParseError("Could not load the MER sample data.");
    } finally {
      setParsing(false);
    }
  }

  const constraintRows = formData.uploads.constraints;
  const assetRows = formData.uploads.assets;

  const unclearCount = constraintRows
    ? constraintRows.filter(isBlankOwner).length
    : 0;

  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          Pick a template + bring in your data
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          We&apos;ll wire the stages, then import your roster, assets and open constraints.
        </p>
      </header>

      <div className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
          Choose a template
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => {
            const selected = formData.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, template: t.id }))
                }
                className={`relative rounded-2xl border p-5 text-left transition-all ${
                  selected
                    ? "border-accent bg-[color:var(--accent)]/5 shadow-[0_4px_24px_-8px_rgba(138,61,214,0.3)]"
                    : "border-paper-line bg-paper-card hover:border-border-soft"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-ink">{t.name}</h3>
                      {t.recommended && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-deep">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">
                      {t.description}
                    </p>
                  </div>
                  {selected && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-paper text-xs font-bold">
                      ✓
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-mid">
                  {t.stages.map((s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="rounded-full bg-paper-warm px-2 py-1 text-ink">
                        {s}
                      </span>
                      {i < t.stages.length - 1 && (
                        <span className="text-ink-mid/60">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Bring in your data
          </h2>
          <button
            type="button"
            onClick={loadDub16Sample}
            disabled={parsing}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent-deep transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            <span aria-hidden>⚡</span>
            Load MER sample
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {UPLOAD_CARDS.map((c) => {
            const rows = formData.uploads[c.key];
            const empty = rows === null;
            return (
              <label
                key={c.key}
                className={`relative block cursor-pointer rounded-2xl p-4 transition-all ${
                  empty
                    ? "border-2 border-dashed border-paper-line bg-paper-card hover:border-accent hover:bg-paper-warm/40"
                    : "border border-green-300 bg-green-50/60"
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="sr-only"
                  onChange={(e) => handleFile(c.key, e)}
                />
                {empty ? (
                  <>
                    <div className="flex items-center gap-2 text-ink-mid">
                      <UploadIcon />
                      <p className="font-medium text-ink text-sm">{c.title}</p>
                    </div>
                    <p className="mt-2 text-xs text-ink-mid">
                      Drop CSV or click to upload
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white text-xs font-bold">
                        ✓
                      </span>
                      <p className="font-medium text-ink text-sm">{c.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-ink-mid">{c.subtitle}</p>
                    <p className="mt-3 text-xs font-medium text-green-700">
                      {c.countFn(rows!)}
                    </p>
                  </>
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-3">
          <RegisterCard
            register={formData.uploads.register}
            parsing={parsing}
            error={parseError}
            onFile={handleRegisterFile}
          />
        </div>

        <div className="mt-3">
          <XerCard
            xer={formData.uploads.xer}
            parsing={parsing}
            error={xerError}
            onFile={handleXerFile}
          />
        </div>
      </div>

      {assetRows && assetRows.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
            Preview · asset register
          </h2>
          <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper-warm text-xs font-medium uppercase tracking-wide text-ink-mid">
                <tr>
                  <th className="px-4 py-3 text-left">Asset ID</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-line">
                {assetRows.slice(0, 6).map((r: any, i: number) => {
                  const ownerBlank = isBlankOwner(r);
                  return (
                    <tr key={r.asset_id ?? i}>
                      <td className="px-4 py-3 font-mono text-xs text-ink-mid">
                        {r.asset_id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ink">{r.asset_type ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${stageBadgeClasses(r.current_stage ?? "")}`}
                        >
                          {r.current_stage ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {ownerBlank ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 font-mono text-xs font-semibold text-red-700">
                            Owner unclear
                          </span>
                        ) : (
                          <span className="text-ink-mid">{r.owner_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-mid">
                        {truncate(r.notes ?? "", 60) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {constraintRows && constraintRows.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
            Preview · constraint log
          </h2>
          <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper-warm text-xs font-medium uppercase tracking-wide text-ink-mid">
                <tr>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Linked assets</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-line">
                {constraintRows.slice(0, 6).map((r: any, i: number) => {
                  const ownerBlank = isBlankOwner(r);
                  return (
                    <tr key={r.id ?? i}>
                      <td className="px-4 py-3 font-mono text-xs text-ink-mid">
                        {r.id ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {r.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-mid">
                        {r.linked_assets ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {ownerBlank ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 font-mono text-xs font-semibold text-red-700">
                            Owner unclear
                          </span>
                        ) : (
                          <span className="text-ink-mid">{r.owner_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-mid">
                        {r.deadline ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {unclearCount > 0 && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
              <span className="text-lg">⚠️</span>
              <p className="text-red-800">
                <span className="font-semibold">
                  {unclearCount} {unclearCount === 1 ? "constraint has" : "constraints have"} no owner
                </span>
                <span className="text-red-700"> — Keldra has tagged {unclearCount === 1 ? "it" : "them"} </span>
                <span className="font-semibold">Owner unclear</span>
                <span className="text-red-700">. Assign {unclearCount === 1 ? "it" : "them"} after onboarding.</span>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RegisterStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-green-200 bg-paper-card px-3 py-2.5">
      <p
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1 }}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-mid">{label}</p>
    </div>
  );
}

function RegisterCard({
  register,
  parsing,
  error,
  onFile,
}: {
  register: ParsedRegister | null;
  parsing: boolean;
  error: string | null;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  // ---- done state ----
  if (register) {
    const r = register;
    const preview = r.constraints.slice(0, 5);
    const range = r.dateRange
      ? `${fmtDate(r.dateRange.from)} → ${fmtDate(r.dateRange.to)}`
      : "—";
    return (
      <div className="rounded-2xl border border-green-300 bg-green-50/60 p-5">
        <p
          className="font-mono font-semibold uppercase text-accent-deep"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          Project history · absorbed
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-sm text-ink truncate">{r.fileName}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <RegisterStat
            value={`${r.rowCount}`}
            label={r.rowCount === 1 ? "constraint parsed" : "constraints parsed"}
          />
          <RegisterStat
            value={`${r.eventCount}`}
            label="comment events absorbed into audit chain"
          />
          <RegisterStat value={range} label="date range: earliest → latest" />
        </div>

        <ul className="mt-4 divide-y divide-green-200 rounded-xl border border-green-200 bg-paper-card">
          {preview.map((c) => (
            <li
              key={c.item_no}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <span className="w-12 flex-shrink-0 font-mono text-xs text-ink-mid">
                {c.item_no}
              </span>
              <span className="flex-1 min-w-0 truncate text-ink">
                {truncate(c.description, 64) || "—"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${registerStatusClasses(c.status)}`}
              >
                {c.status === "AWAITING_INPUT" ? "AWAITING" : c.status}
              </span>
              <span className="w-16 flex-shrink-0 text-right text-xs text-ink-mid">
                {daysOpen(c)}d open
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs italic text-ink-mid">
          Each row hash-chained as a blocker event. Owner-unclear flags raised
          automatically where Action By is blank or ambiguous.
        </p>
      </div>
    );
  }

  // ---- empty state ----
  return (
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-paper-line bg-paper-card p-5 transition-all hover:border-accent hover:bg-paper-warm/40">
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="sr-only"
        onChange={onFile}
      />
      <p
        className="font-mono font-semibold uppercase text-accent-deep"
        style={{ fontSize: 10, letterSpacing: "0.14em" }}
      >
        Project history · absorb your actual data
      </p>
      <h3
        className="mt-1.5 font-[family-name:var(--font-fraunces)] font-medium text-ink"
        style={{ fontSize: 18, lineHeight: 1.2 }}
      >
        Action register / meeting minutes
      </h3>
      <p className="mt-1 italic text-ink-mid" style={{ fontSize: 13 }}>
        Drop your existing tracker. Every row becomes a structured blocker. Every
        comment becomes a hash-chained event.
      </p>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-paper-line bg-paper-warm/30 px-4 py-7 text-center">
        <span className="text-ink-mid">
          <SpreadsheetIcon />
        </span>
        {parsing ? (
          <p className="text-sm font-medium text-accent-deep">Parsing…</p>
        ) : (
          <p className="text-sm font-medium text-ink">
            Drop .xlsx or .csv here, or click to upload
          </p>
        )}
        <p className="max-w-md text-xs leading-snug text-ink-mid">
          Accepts action registers, constraint logs, security meeting minutes,
          defect trackers. The Comments column becomes your audit history.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </label>
  );
}

function ScheduleIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <path d="M7 13h5M7 17h8" />
    </svg>
  );
}

function XerCard({
  xer,
  parsing,
  error,
  onFile,
}: {
  xer: ParsedXer | null;
  parsing: boolean;
  error: string | null;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  // ---- done state ----
  if (xer) {
    const s = xer.stats;
    const plan = xer.project
      ? `${xer.project.planStart ? fmtDate(xer.project.planStart) : "—"} → ${
          xer.project.planEnd ? fmtDate(xer.project.planEnd) : "—"
        }`
      : "—";
    return (
      <div className="rounded-2xl border border-green-300 bg-green-50/60 p-5">
        <p
          className="font-mono font-semibold uppercase text-accent-deep"
          style={{ fontSize: 10, letterSpacing: "0.14em" }}
        >
          Programme / schedule · ingested
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-sm text-ink truncate">
            {xer.fileName}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RegisterStat value={`${s.activityCount}`} label="activities parsed" />
          <RegisterStat
            value={`${s.completedCount} · ${s.inProgressCount} · ${s.notStartedCount}`}
            label="complete · in progress · not started"
          />
          <RegisterStat value={`${s.criticalCount}`} label="on critical path" />
          <RegisterStat
            value={`${s.slippingCount}`}
            label="slipping vs baseline"
          />
        </div>

        <p className="mt-3 text-xs text-ink">
          <span className="font-semibold">Plan:</span> {plan}
        </p>

        <p className="mt-2 text-xs italic text-ink-mid">
          Activities mapped to assets via task_code. Unmapped activities remain
          visible in the schedule but unlinked.
        </p>
      </div>
    );
  }

  // ---- empty state ----
  return (
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-paper-line bg-paper-card p-5 transition-all hover:border-accent hover:bg-paper-warm/40">
      <input
        type="file"
        accept=".xer"
        className="sr-only"
        onChange={onFile}
      />
      <p
        className="font-mono font-semibold uppercase text-accent-deep"
        style={{ fontSize: 10, letterSpacing: "0.14em" }}
      >
        Programme / schedule
      </p>
      <h3
        className="mt-1.5 font-[family-name:var(--font-fraunces)] font-medium text-ink"
        style={{ fontSize: 18, lineHeight: 1.2 }}
      >
        P6 XER export
      </h3>
      <p className="mt-1 italic text-ink-mid" style={{ fontSize: 13 }}>
        Drag your P6 XER file here. Keldra reads activities, dates, and
        relationships.
      </p>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-paper-line bg-paper-warm/30 px-4 py-7 text-center">
        <span className="text-ink-mid">
          <ScheduleIcon />
        </span>
        {parsing ? (
          <p className="text-sm font-medium text-accent-deep">Parsing…</p>
        ) : (
          <p className="text-sm font-medium text-ink">
            Drop .xer file here, or click to upload
          </p>
        )}
        <p className="max-w-md text-xs leading-snug text-ink-mid">
          Accepts P6 XER exports from Primavera v15 onwards. Activities map to
          your asset register via activity ID.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </label>
  );
}
