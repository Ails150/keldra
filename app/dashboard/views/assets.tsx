"use client";

import { useEffect, useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import type { DbGate } from "@/lib/org/dashboard-data";
import { forecastAsset, gateForSystem } from "@/lib/assets/gate-map";
import { useDemo } from "../demo-store";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tag overlay (from /api/assets/tags), merged onto the register by asset_id.
type TagRow = {
  asset_id: string;
  tag: "red" | "yellow" | "green";
  status: "achieved" | "in_progress" | "late" | "blocked";
  achievedDate: string | null;
  targetDate: string | null;
  daysAtTag: number | null;
  done: number;
  total: number;
};
const TAG_RANK: Record<string, number> = { red: 3, yellow: 2, green: 1 };
const TAG_CLS: Record<string, string> = { red: "bg-red-100 text-red-700", yellow: "bg-yellow-100 text-yellow-800", green: "bg-green-100 text-green-800" };
const STATUS_CLS: Record<string, string> = { achieved: "bg-green-100 text-green-800", in_progress: "bg-indigo-100 text-indigo-800", late: "bg-amber-100 text-amber-800", blocked: "bg-red-100 text-red-700" };
const STATUS_LABEL: Record<string, string> = { achieved: "Achieved", in_progress: "In progress", late: "Late", blocked: "Blocked" };

type TagFilter = "all" | "red" | "yellow" | "delayed";

export default function AssetsView({
  project,
  viewingAs,
  highlightIds,
  onClearHighlight,
  blockerMap,
  onOpenBlocker,
  dbGates,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  highlightIds?: string[] | null;
  onClearHighlight?: () => void;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
  dbGates?: DbGate[];
}) {
  const { assets: liveAssets, openBlockers, burnPerDay } = useDemo();
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [query, setQuery] = useState("");
  const [tagsById, setTagsById] = useState<Record<string, TagRow>>({});
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [dateOpen, setDateOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Tag overlay for the whole list, org-scoped (anon → 401 → no overlay).
  useEffect(() => {
    let live = true;
    fetch("/api/assets/tags")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j?.tags) return;
        const m: Record<string, TagRow> = {};
        for (const t of j.tags as TagRow[]) m[t.asset_id] = t;
        setTagsById(m);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const highlightSet = highlightIds && highlightIds.length > 0 ? new Set(highlightIds.map((s) => s.trim())) : null;
  const burnByAsset = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of openBlockers) m[b.asset_id] = (m[b.asset_id] ?? 0) + b.burn_per_day;
    return m;
  }, [openBlockers]);

  const tagged = Object.keys(tagsById).length > 0;

  // Register-level follow-on impact: tags → blocked gates → worst milestone slip.
  const impact = useMemo(() => {
    const gates = dbGates ?? [];
    if (!gates.length) return null;
    const blocked = gates.filter((g) => g.status === "blocked");
    const redBelow = gates.reduce((s, g) => s + g.tagCounts.red, 0);
    const worst = gates.filter((g) => g.milestoneName && g.milestoneSlipDays > 0).sort((a, b) => b.milestoneSlipDays - a.milestoneSlipDays)[0];
    if (!blocked.length && !worst) return null;
    return { blockedCount: blocked.length, redBelow, milestone: worst?.milestoneName ?? null, slip: worst?.milestoneSlipDays ?? 0, gateCode: worst?.code ?? blocked[0]?.code ?? null };
  }, [dbGates]);

  const counts = useMemo(() => {
    let red = 0, yellow = 0, green = 0;
    for (const t of Object.values(tagsById)) { if (t.tag === "red") red++; else if (t.tag === "yellow") yellow++; else if (t.tag === "green") green++; }
    return { red, yellow, green };
  }, [tagsById]);

  const rows = useMemo(() => {
    let list = liveAssets.slice();
    if (highlightSet) list = list.filter((a) => highlightSet.has((a.asset_id ?? "").trim()));
    if (tagFilter !== "all") {
      list = list.filter((a) => {
        const t = tagsById[a.asset_id];
        if (!t) return false;
        if (tagFilter === "red") return t.tag === "red";
        if (tagFilter === "yellow") return t.tag === "yellow";
        return t.status === "late" || t.status === "blocked"; // delayed
      });
    }
    if (dateFrom || dateTo) {
      list = list.filter((a) => {
        const d = tagsById[a.asset_id]?.achievedDate;
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((a) => [a.asset_id, a.asset_type, a.system, a.location].some((f) => (f ?? "").toString().toLowerCase().includes(q)));
    const rank = (a: any) => { const t = tagsById[a.asset_id]; return t ? TAG_RANK[t.tag] : -1; };
    return list.sort((a, b) => rank(b) - rank(a));
  }, [liveAssets, highlightSet, tagFilter, dateFrom, dateTo, query, tagsById]);

  const clearDate = () => { setDateFrom(""); setDateTo(""); };
  const quick = (kind: "week" | "month" | "overdue") => {
    if (kind === "overdue") { setTagFilter("delayed"); clearDate(); }
    else {
      setTagFilter("all");
      const now = new Date();
      const from = new Date(now.getTime() - (kind === "week" ? 7 : 30) * 86_400_000);
      setDateFrom(from.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
    setDateOpen(false);
  };

  const CHIPS: { id: TagFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "red", label: "🔴 Red → progressing to Yellow" },
    { id: "yellow", label: "🟡 Yellow → progressing to Green" },
    { id: "delayed", label: "⏱ Delayed vs programme" },
  ];

  return (
    <section className="mx-auto max-w-6xl px-8">
      <header>
        <h1 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 32, lineHeight: 1.1 }}>
          Assets
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          {liveAssets.length} assets across the MER commissioning register · tags are the spine, gates roll up from them.
        </p>
      </header>

      {/* Follow-on impact cascade — tags → gates → milestone */}
      {impact && (impact.slip > 0 || impact.redBelow > 0) && (
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "#eccdd8", background: "linear-gradient(120deg,#fdeef2,#fff)" }}>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "#b3274d" }}>Follow-on impact · tags → gates → milestone</p>
          <p className="mt-1.5 font-[family-name:var(--font-fraunces)]" style={{ fontSize: 18, color: "#1c1230", lineHeight: 1.35 }}>
            <b>{impact.redBelow}</b> assets below Green are holding <b>{impact.blockedCount} gate{impact.blockedCount === 1 ? "" : "s"}</b>
            {impact.milestone && impact.slip > 0 ? <> — pushing <b style={{ color: "#b3274d" }}>{impact.milestone} {impact.slip} days late</b>.</> : "."}
          </p>
        </div>
      )}

      {/* Rollup cards — tags are the spine; gates roll up from these */}
      {tagged && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <RollupCard label="Green · operational" value={counts.green} tone="#2f7d3a" />
          <RollupCard label="Yellow · at risk" value={counts.yellow} tone="#9a6b00" />
          <RollupCard label="Red · in place" value={counts.red} tone="#b3274d" />
          <RollupCard label="Live exposure" value={`£${Math.round(burnPerDay / 1000)}k/day`} tone="#b3274d" />
        </div>
      )}

      {/* Tag filters + date popover */}
      <div className={`${tagged ? "mt-5" : "mt-6"} flex flex-wrap items-center gap-2`}>
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-mid">Filter</span>
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setTagFilter(c.id); if (c.id !== "all") clearDate(); }}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${tagFilter === c.id && !(dateFrom || dateTo) ? "border-accent bg-accent text-paper font-semibold" : "border-paper-line bg-paper-card text-ink-mid hover:border-accent"}`}
          >
            {c.label}
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDateOpen((o) => !o)}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${dateFrom || dateTo ? "border-accent bg-accent text-paper font-semibold" : "border-paper-line bg-paper-card text-ink-mid hover:border-accent"}`}
          >
            By date ▾
          </button>
          {dateOpen && (
            <div className="absolute left-0 top-10 z-30 w-64 rounded-xl border border-paper-line bg-paper-card p-3.5 shadow-lg">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mid">Tag reached between</p>
              <div className="flex gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-paper-line bg-paper-card px-2 py-1.5 text-xs text-ink outline-none focus:border-accent" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-paper-line bg-paper-card px-2 py-1.5 text-xs text-ink outline-none focus:border-accent" />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => quick("week")} className="rounded-full bg-paper-warm px-2.5 py-1 text-[11px] text-accent-deep hover:bg-accent/10">This week</button>
                <button type="button" onClick={() => quick("month")} className="rounded-full bg-paper-warm px-2.5 py-1 text-[11px] text-accent-deep hover:bg-accent/10">Last 30 days</button>
                <button type="button" onClick={() => quick("overdue")} className="rounded-full bg-paper-warm px-2.5 py-1 text-[11px] text-accent-deep hover:bg-accent/10">Overdue only</button>
              </div>
            </div>
          )}
        </div>
        {(tagFilter !== "all" || dateFrom || dateTo) && (
          <button type="button" onClick={() => { setTagFilter("all"); clearDate(); }} className="text-xs font-medium text-accent hover:text-accent-deep">
            Clear
          </button>
        )}
      </div>

      {highlightSet && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm">
          <p className="text-ink">Showing assets linked to a blocker: <span className="font-medium">{Array.from(highlightSet).join(", ")}</span></p>
          <button type="button" onClick={onClearHighlight} className="text-xs font-medium text-accent hover:text-accent-deep">Clear filter</button>
        </div>
      )}

      {/* Live search */}
      <div className="mt-4 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search asset ID, type, system or zone…"
          className="flex-1 rounded-xl border border-paper-line bg-paper-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-xs font-medium text-accent hover:text-accent-deep">Clear</button>
        )}
        <span className="whitespace-nowrap text-xs text-ink-mid">showing {rows.length} of {liveAssets.length}</span>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
        <div className="max-h-[62vh] overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-paper-warm">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
                <Th>Asset</Th><Th>System</Th><Th>Tag</Th><Th>Status</Th><Th>Progressing to</Th><Th>Days at tag</Th><Th>Delay</Th><Th right>£/day</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const t = tagsById[a.asset_id];
                const hot = highlightSet?.has((a.asset_id ?? "").trim());
                const burn = burnByAsset[a.asset_id] ?? 0;
                return (
                  <tr
                    key={a.asset_id ?? i}
                    onClick={() => setSelectedAsset(a)}
                    className={`cursor-pointer border-t border-paper-line transition-colors hover:bg-paper-warm/60 ${hot ? "bg-accent/5" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] text-purple-900">{a.asset_id}</span>
                      <span className="block text-[11px] text-ink-mid">{a.asset_type} · {a.location}</span>
                    </td>
                    <Td muted>{a.system}</Td>
                    <td className="px-3 py-2">
                      {t ? <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${TAG_CLS[t.tag]}`}>{t.tag}</span> : <span className="text-ink-mid">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {t ? <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLS[t.status]}`}>{STATUS_LABEL[t.status] ?? t.status}</span> : <span className="text-ink-mid">—</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-ink-mid">
                      {t ? (t.tag === "green" ? "operational" : <>→ <b className="text-purple-900">{t.tag === "red" ? "Yellow" : "Green"}</b> · {t.done} of {t.total} done</>) : "—"}
                    </td>
                    <Td muted>{t?.daysAtTag == null ? "—" : `${t.daysAtTag}d`}</Td>
                    <td className="px-3 py-2 text-[12px] font-medium">
                      {(() => {
                        if (!t) return <span className="text-ink-mid">—</span>;
                        const f = forecastAsset(t.tag, t.total - t.done, t.targetDate);
                        return f.onTrack ? <span style={{ color: "#2f7d3a" }}>{t.tag === "green" ? "done" : "on track"}</span> : <span style={{ color: "#b3274d" }}>+{f.lateDays}d late</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: burn ? "#b91c1c" : "#9ca3af" }}>
                      {burn ? `£${Math.round(burn / 1000)}k` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {!tagged && (
        <p className="mt-2 text-[11px] italic text-ink-mid">Tag overlay loads for signed-in orgs — the public demo shows the register only.</p>
      )}

      <AssetDetailPanel
        asset={selectedAsset}
        blockerMap={blockerMap}
        xer={project.uploads.xer}
        dbGates={dbGates}
        onClose={() => setSelectedAsset(null)}
        onOpenBlocker={(id) => { setSelectedAsset(null); onOpenBlocker(id); }}
      />
    </section>
  );
}

function RollupCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold" style={{ fontSize: 28, lineHeight: 1, color: tone }}>{value}</p>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <td className={`px-3 py-2 text-[12.5px] ${muted ? "text-ink-mid" : "text-ink"}`}>{children}</td>;
}
