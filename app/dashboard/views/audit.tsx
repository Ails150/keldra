"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import { roleLabel } from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function AuditView({
  project,
  viewingAs,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
}) {
  const events =
    (project.uploads.constraints?.length ?? 0) * 3 +
    (project.uploads.assets?.length ?? 0) * 2 +
    (project.uploads.team?.length ?? 0);

  const integrity = events > 0 ? 100 : 100; // demo — always intact
  const lastEvent = new Date().toLocaleString("en-IE", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Audit
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          Universal audit trail — visible to every role, including {roleLabel(viewingAs.role)}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Events captured" value={events.toLocaleString()} sub="Tamper-evident chain" />
        <Stat label="Chain integrity" value={`${integrity}%`} sub="All hashes verified" tone="good" />
        <Stat label="Last event" value={lastEvent} sub="Local time" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => alert("Would generate the L5 handover pack (PDF + CSV + chain manifest).")}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent"
        >
          Generate handover pack
        </button>
        <button
          type="button"
          onClick={() => alert("Would export this week's snapshot to /exports/weekly-2026-W21.zip.")}
          className="rounded-xl border border-paper-line bg-paper-card px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Export weekly snapshot
        </button>
      </div>

      <RecentChainSample project={project} />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
        {label}
      </p>
      <p
        className={`mt-2 font-[family-name:var(--font-fraunces)] font-semibold ${
          tone === "good" ? "text-green-700" : "text-ink"
        }`}
        style={{ fontSize: 32, lineHeight: 1 }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-mid">{sub}</p>}
    </div>
  );
}

function RecentChainSample({ project }: { project: WizardData }) {
  const sample: any[] = [];
  (project.uploads.constraints ?? []).slice(0, 3).forEach((c: any, i: number) => {
    sample.push({
      id: `evt-${1000 + i}`,
      what: `Constraint ${c.id ?? "—"} ingested`,
      by: c.raised_by || "Keldra",
      when: "·",
    });
  });
  (project.uploads.assets ?? []).slice(0, 2).forEach((a: any, i: number) => {
    sample.push({
      id: `evt-${2000 + i}`,
      what: `Asset ${a.asset_id ?? "—"} stage = ${a.current_stage ?? "—"}`,
      by: a.owner_name || "—",
      when: "·",
    });
  });
  if (sample.length === 0) return null;

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
      <div className="border-b border-paper-line bg-paper-warm px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-mid">
        Recent chain entries
      </div>
      <ul className="divide-y divide-paper-line">
        {sample.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-3 px-4 py-3 text-xs text-ink-mid"
          >
            <span className="font-mono text-[11px] text-ink-mid w-20">{e.id}</span>
            <span className="flex-1 text-ink">{e.what}</span>
            <span className="text-ink-mid">{e.by}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
