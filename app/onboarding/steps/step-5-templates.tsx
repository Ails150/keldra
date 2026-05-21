"use client";

import Papa from "papaparse";
import type { ChangeEvent } from "react";
import type { StepProps } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TEMPLATES = [
  {
    id: "mercury-red-tag",
    name: "Mercury Red Tag v1",
    description: "Mercury's MEP commissioning pipeline. Asset-level red/yellow/green tagging with ready-criteria gates.",
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
    description: "For skid-delivered MEP. Factory test → site connect → commissioning → handover.",
    stages: ["Designed", "Factory tested", "Delivered", "Sited", "Connected", "Commissioned", "Handed over"],
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

export default function Step5Templates({ formData, setFormData }: StepProps) {
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
          Bring in your data
        </h2>
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
