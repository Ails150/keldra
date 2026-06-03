"use client";

import { useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { STAGE_META, normalizeStage } from "../lib/cx-stages";
import { useDemo } from "../demo-store";
import { assetStats } from "../lib/demo-assets";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SEVERITY: Record<string, number> = { RT: 6, "On YT": 5, "Off YT": 4, Delivered: 3, "Off GT": 2, "On GT": 1 };

function shortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function AssetsView({
  project,
  viewingAs,
  highlightIds,
  onClearHighlight,
  blockerMap,
  onOpenBlocker,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  highlightIds?: string[] | null;
  onClearHighlight?: () => void;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
}) {
  const { assets: liveAssets, burnPerDay, openBlockers } = useDemo();
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const highlightSet =
    highlightIds && highlightIds.length > 0 ? new Set(highlightIds.map((s) => s.trim())) : null;

  const stats = useMemo(() => assetStats(liveAssets), [liveAssets]);
  // £/day is owned by the live blocker set — one source of truth across surfaces.
  const burnByAsset = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of openBlockers) m[b.asset_id] = (m[b.asset_id] ?? 0) + b.burn_per_day;
    return m;
  }, [openBlockers]);

  const rows = useMemo(() => {
    let list = liveAssets.slice();
    if (highlightSet) list = list.filter((a) => highlightSet.has((a.asset_id ?? "").trim()));
    if (stageFilter === "RT") list = list.filter((a) => a.current_stage === "RT");
    else if (stageFilter === "YT") list = list.filter((a) => (a.current_stage ?? "").includes("YT"));
    else if (stageFilter === "GT") list = list.filter((a) => (a.current_stage ?? "").includes("GT"));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((a) => [a.asset_id, a.asset_type, a.system, a.location, a.owner_name].some((f) => (f ?? "").toString().toLowerCase().includes(q)));
    return list.sort((a, b) => (SEVERITY[b.current_stage] ?? 0) - (SEVERITY[a.current_stage] ?? 0));
  }, [liveAssets, highlightSet, stageFilter, query]);

  return (
    <section className="mx-auto max-w-6xl px-8">
      <header>
        <h1 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 32, lineHeight: 1.1 }}>
          Assets
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          {stats.total} assets across the MER commissioning register.
        </p>
      </header>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryStat label="Commissioned" value={stats.commissioned} tone="good" onClick={() => setStageFilter(stageFilter === "GT" ? null : "GT")} active={stageFilter === "GT"} />
        <SummaryStat label="At risk · yellow" value={stats.atRisk} tone="warn" onClick={() => setStageFilter(stageFilter === "YT" ? null : "YT")} active={stageFilter === "YT"} />
        <SummaryStat label="Red-tagged" value={stats.redTagged} tone="danger" onClick={() => setStageFilter(stageFilter === "RT" ? null : "RT")} active={stageFilter === "RT"} />
        <SummaryStat label="Live exposure" value={`£${Math.round(burnPerDay / 1000)}k/day`} tone="danger" />
      </div>

      {highlightSet && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm">
          <p className="text-ink">Showing assets linked to a blocker: <span className="font-medium">{Array.from(highlightSet).join(", ")}</span></p>
          <button type="button" onClick={onClearHighlight} className="text-xs font-medium text-accent hover:text-accent-deep">Clear filter</button>
        </div>
      )}
      {stageFilter && !highlightSet && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-paper-line bg-paper-warm/50 px-4 py-2 text-sm">
          <p className="text-ink-mid">Filtered to {stageFilter === "RT" ? "red-tagged" : stageFilter === "YT" ? "yellow-tag" : "commissioned"} assets · {rows.length}</p>
          <button type="button" onClick={() => setStageFilter(null)} className="text-xs font-medium text-accent hover:text-accent-deep">Show all</button>
        </div>
      )}

      {/* Live search — client-side, works alongside the status tiles */}
      <div className="mt-5 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search asset ID, type, system, zone or owner…"
          className="flex-1 rounded-xl border border-paper-line bg-paper-card px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-xs font-medium text-accent hover:text-accent-deep">
            Clear
          </button>
        )}
        <span className="whitespace-nowrap text-xs text-ink-mid">
          showing {rows.length} of {liveAssets.length}
        </span>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
        <div className="max-h-[62vh] overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-paper-warm">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
                <Th>Asset ID</Th><Th>Type</Th><Th>Zone</Th><Th>System</Th><Th>Stage</Th><Th>Owner</Th>
                <Th center>Red</Th><Th center>Yellow</Th><Th center>Green</Th><Th right>£/day</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const meta = STAGE_META[normalizeStage(a.current_stage)];
                const hot = highlightSet?.has((a.asset_id ?? "").trim());
                return (
                  <tr
                    key={a.asset_id ?? i}
                    onClick={() => setSelectedAsset(a)}
                    className={`cursor-pointer border-t border-paper-line transition-colors hover:bg-paper-warm/60 ${hot ? "bg-accent/5" : ""}`}
                  >
                    <Td mono>{a.asset_id}</Td>
                    <Td>{a.asset_type}</Td>
                    <Td muted>{a.location}</Td>
                    <Td muted>{a.system}</Td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.border} ${meta.text} border`}>{a.current_stage}</span>
                    </td>
                    <Td muted>{a.owner_name || <span className="text-red-600">Unclear</span>}</Td>
                    <Td center muted>{shortDate(a.red_tag_date)}</Td>
                    <Td center muted>{shortDate(a.yellow_tag_date)}</Td>
                    <Td center muted>{shortDate(a.green_date)}</Td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: (burnByAsset[a.asset_id] ?? 0) ? "#b91c1c" : "#9ca3af" }}>
                      {(burnByAsset[a.asset_id] ?? 0) ? `£${Math.round((burnByAsset[a.asset_id] ?? 0) / 1000)}k` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AssetDetailPanel
        asset={selectedAsset}
        blockerMap={blockerMap}
        xer={project.uploads.xer}
        onClose={() => setSelectedAsset(null)}
        onOpenBlocker={(id) => { setSelectedAsset(null); onOpenBlocker(id); }}
      />
    </section>
  );
}

function SummaryStat({ label, value, tone, onClick, active }: { label: string; value: string | number; tone: "good" | "warn" | "danger"; onClick?: () => void; active?: boolean }) {
  const colour = tone === "good" ? "#15803d" : tone === "warn" ? "#b45309" : "#b91c1c";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-2xl border bg-paper-card p-4 text-left transition-colors ${active ? "border-ink" : "border-paper-line"} ${onClick ? "hover:border-accent cursor-pointer" : "cursor-default"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold" style={{ fontSize: 26, lineHeight: 1, color: colour }}>{value}</p>
    </button>
  );
}

function Th({ children, center, right }: { children: React.ReactNode; center?: boolean; right?: boolean }) {
  return <th className={`px-3 py-2.5 ${center ? "text-center" : right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, mono, muted, center }: { children: React.ReactNode; mono?: boolean; muted?: boolean; center?: boolean }) {
  return (
    <td className={`px-3 py-2 text-[12.5px] ${mono ? "font-mono text-[11px] text-purple-900" : muted ? "text-ink-mid" : "text-ink"} ${center ? "text-center" : ""}`}>
      {children}
    </td>
  );
}
