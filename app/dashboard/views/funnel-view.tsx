"use client";

import { useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import { type BlockerMap, isOpen } from "../lib/blocker-state";
import { getInitials, deriveOrgColour } from "../utils";
import { normalizeStage } from "../lib/cx-stages";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const FUNNEL = [
  { label: "Planned", sub: "60 assets planned for RT", width: 100, cls: "bg-zinc-400" },
  { label: "Walked", sub: "41 walked", width: 68, cls: "bg-amber-500" },
  { label: "Documented", sub: "25 documented", width: 42, cls: "bg-orange-500" },
  { label: "Achieved", sub: "13 achieved", width: 22, cls: "bg-red-500" },
];

const DROPS = [
  "19 dropped. Walks slipped or assets replaced mid-flight.",
  "16 dropped. Engineering / drawing markups missing.",
  "12 dropped. Nexus confirmation pending.",
];

const BREAKDOWN = [
  { label: "Engineering blockers", n: 23, cap: "Drawings, RFIs, design ambiguity" },
  { label: "Construction blockers", n: 16, cap: "Install, FOK, physical complete" },
  { label: "Documentation blockers", n: 16, cap: "Paperwork, sign-offs, Nexus uploads" },
];

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onAlertAction?: (target: string) => void;
};

export default function FunnelView({
  project,
  viewingAs: _viewingAs,
  blockerMap,
  onAlertAction,
}: Props) {
  const [activeAsset, setActiveAsset] = useState<any | null>(null);

  const assets = project.uploads.assets ?? [];
  const assetById = new Map<string, any>(
    assets.map((a: any) => [(a.asset_id ?? "").toString().trim(), a]),
  );

  const recovery = blockerMap
    ? Object.values(blockerMap)
        .filter(isOpen)
        .sort((a, b) => b.cost_per_day - a.cost_per_day)
        .slice(0, 10)
    : [];

  return (
    <section className="mx-auto max-w-5xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Red Tag Funnel
        </h1>
        <p
          className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 16 }}
        >
          Per-asset progression from planned to achieved. Cross-org
          accountability at each gate.
        </p>
      </header>

      {/* Status card */}
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
          As of today · DUB-16
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatBlock label="Planned RT" value="60" />
          <StatBlock label="Walked RT" value="41" caption="-19, 32% miss" />
          <StatBlock
            label="Documentation uploaded"
            value="25"
            caption="-16, 38% drop"
          />
          <StatBlock
            label="Achieved RT (Nexus)"
            value="13"
            caption="-12, 48% drop"
            danger
          />
        </div>
        <p
          className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 18 }}
        >
          Target recovery: 63 RT closed by end of week
        </p>
      </div>

      {/* Funnel */}
      <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
        {FUNNEL.map((s, i) => (
          <div key={s.label}>
            <div
              className={`mx-auto flex h-12 items-center justify-between rounded-lg px-4 text-white ${s.cls}`}
              style={{ width: `${s.width}%` }}
            >
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="text-xs opacity-90">{s.sub}</span>
            </div>
            {i < DROPS.length && (
              <p className="py-1.5 text-center text-[11px] text-ink-mid">
                ↓ {DROPS[i]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Blocker breakdown */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Active blockers by category
          </h2>
          <span className="text-xs text-ink-mid">55 active blockers</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {BREAKDOWN.map((b) => (
            <div
              key={b.label}
              className="rounded-2xl border border-paper-line bg-paper-card p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                {b.label}
              </p>
              <p
                className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 32, lineHeight: 1 }}
              >
                {b.n}
              </p>
              <p className="mt-1 text-xs text-ink-mid">{b.cap}</p>
              <button
                type="button"
                onClick={() => onAlertAction?.("tab:constraints")}
                className="mt-3 text-[11px] font-medium text-accent hover:text-accent-deep"
              >
                View {b.n} items →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recovery plan */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mid">
          To recover 63 RT by Friday
        </h2>
        {recovery.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-8 text-center text-sm text-ink-mid">
            No open blockers in the chain yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
            <ul className="divide-y divide-paper-line">
              {recovery.map((b) => {
                const aid = (b.linked_assets[0] ?? "").toString().trim();
                const asset = assetById.get(aid);
                return (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <div className="w-40 flex-shrink-0">
                      <p className="font-mono text-[11px] text-ink-mid">
                        {asset?.asset_id ?? aid ?? "—"}
                      </p>
                      <p className="truncate text-xs text-ink">
                        {asset?.asset_type ?? "—"}
                      </p>
                    </div>
                    <span className="w-20 flex-shrink-0 text-[11px] text-ink-mid">
                      {asset ? normalizeStage(asset.current_stage) : "—"}
                    </span>
                    <span className="flex-1 truncate text-xs text-ink">
                      {b.description}
                    </span>
                    {b.current_owner && (
                      <span className="hidden items-center gap-1.5 md:flex">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-paper"
                          style={{
                            backgroundColor: deriveOrgColour(
                              b.current_owner_org ?? "",
                            ),
                          }}
                        >
                          {getInitials(b.current_owner)}
                        </span>
                        <span className="text-[11px] text-ink-mid">
                          {b.current_owner}
                        </span>
                      </span>
                    )}
                    <span className="w-24 flex-shrink-0 text-right font-mono text-[11px] font-semibold text-red-700">
                      {GBP.format(b.cost_per_day)}/day
                    </span>
                    <button
                      type="button"
                      disabled={!asset}
                      onClick={() => asset && setActiveAsset(asset)}
                      className="flex-shrink-0 rounded-full bg-ink px-3 py-1 text-[10px] font-medium text-paper transition-colors enabled:hover:bg-accent disabled:opacity-40"
                    >
                      Open
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-ink-mid">
        Live computation from blocker chain · Updates as state changes
      </p>

      <AssetDetailPanel
        asset={activeAsset}
        blockerMap={blockerMap}
        xer={project.uploads.xer}
        onClose={() => setActiveAsset(null)}
        onOpenBlocker={() => setActiveAsset(null)}
      />
    </section>
  );
}

function StatBlock({
  label,
  value,
  caption,
  danger,
}: {
  label: string;
  value: string;
  caption?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-mid">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-fraunces)] font-semibold ${danger ? "text-red-700" : "text-ink"}`}
        style={{ fontSize: 34, lineHeight: 1 }}
      >
        {value}
      </p>
      {caption && (
        <p
          className={`mt-0.5 text-[11px] ${danger ? "font-semibold text-red-700" : "text-ink-mid"}`}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
