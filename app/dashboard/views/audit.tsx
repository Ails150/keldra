"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import { roleLabel } from "../utils";
import { useDemo } from "../demo-store";

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AuditView({
  viewingAs,
  onResetBlockers,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  onResetBlockers?: () => void | Promise<void>;
}) {
  const { state, reset } = useDemo();
  const events = 133 + state.audit.length;
  const last = state.audit[0];

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 32, lineHeight: 1.1 }}>
          Audit
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          Universal, tamper-evident trail — every action this session is on the chain, visible to every role including {roleLabel(viewingAs.role)}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Events captured" value={events.toLocaleString()} sub="Tamper-evident chain" />
        <Stat label="Chain integrity" value="100%" sub="All hashes verified" tone="good" />
        <Stat label="Last event" value={last ? fmtTs(last.ts).split(", ")[1] ?? fmtTs(last.ts) : "—"} sub={last ? `${last.actor} · ${last.action}` : "Local time"} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => alert("Would generate the L5 handover pack (PDF + CSV + chain manifest).")} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent">Generate handover pack</button>
        <button type="button" onClick={() => alert("Would export this week's snapshot to /exports/weekly-2026-W21.zip.")} className="rounded-xl border border-paper-line bg-paper-card px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent">Export weekly snapshot</button>
      </div>

      {/* Live session chain — newest first */}
      <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-paper-line bg-paper-warm px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">Chain entries · this session</span>
          <span className="font-mono text-[11px] text-ink-mid">{state.audit.length} live</span>
        </div>
        <ul className="divide-y divide-paper-line">
          {state.audit.map((e, i) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <span className="font-mono text-[11px] text-ink-mid w-24 flex-shrink-0 pt-0.5">{fmtTs(e.ts).split(", ")[1] ?? fmtTs(e.ts)}</span>
              <span className="flex-shrink-0 rounded-full bg-paper-warm px-2 py-0.5 text-[10px] font-semibold text-ink-mid w-44 truncate" title={e.actor}>{e.actor}</span>
              <span className="min-w-0 flex-1 text-[13px] text-ink">
                <span className="font-medium">{e.action}</span>
                <span className="text-ink-mid"> · {e.detail}</span>
              </span>
              <span className="font-mono text-[10px] text-green-700 flex-shrink-0 pt-0.5" title="hash verified">#{(i + 1).toString(16).padStart(2, "0")}✓</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-end border-t border-paper-line pt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset the demo to the opening scenario?")) {
              reset();
              void onResetBlockers?.();
            }
          }}
          className="rounded-lg border border-paper-line bg-paper-card px-3 py-1.5 text-[11px] font-medium text-ink-mid transition-colors hover:border-red-300 hover:text-red-700"
        >
          ↺ Reset demo to opening scenario
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">{label}</p>
      <p className={`mt-2 font-[family-name:var(--font-fraunces)] font-semibold ${tone === "good" ? "text-green-700" : "text-ink"}`} style={{ fontSize: 32, lineHeight: 1 }}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-mid">{sub}</p>}
    </div>
  );
}
