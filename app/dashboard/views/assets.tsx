"use client";

import { useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { filterAssetsByRole, isBlankOwner, roleLabel } from "../utils";
import {
  CX_STAGES,
  STAGE_META,
  normalizeStage,
  type CxStage,
} from "../lib/cx-stages";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const role = viewingAs.role;
  const assets = filterAssetsByRole(
    project.uploads.assets,
    role,
    viewingAs.orgName,
  );
  const highlightSet =
    highlightIds && highlightIds.length > 0
      ? new Set(highlightIds.map((s) => s.trim()))
      : null;

  const buckets = new Map<CxStage, any[]>();
  CX_STAGES.forEach((s) => buckets.set(s, []));
  assets.forEach((a: any) => {
    buckets.get(normalizeStage(a.current_stage))!.push(a);
  });

  if (assets.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-8">
        <Header role={role} count={0} viewingAs={viewingAs} />
        <div className="mt-6 rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
          No assets in this view.
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-8">
      <Header role={role} count={assets.length} viewingAs={viewingAs} />

      {highlightSet && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm">
          <p className="text-ink">
            Showing assets linked to a blocker:{" "}
            <span className="font-medium">
              {Array.from(highlightSet).join(", ")}
            </span>
          </p>
          <button
            type="button"
            onClick={onClearHighlight}
            className="text-xs font-medium text-accent hover:text-accent-deep"
          >
            Clear filter
          </button>
        </div>
      )}

      <div
        className="mt-6 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${CX_STAGES.length}, minmax(180px, 1fr))` }}
      >
        {CX_STAGES.map((col) => {
          const items = buckets.get(col) ?? [];
          const meta = STAGE_META[col];
          return (
            <div
              key={col}
              className="rounded-2xl border border-paper-line bg-paper-warm/40 p-3"
            >
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink">{col}</p>
                  <span className="text-xs text-ink-mid">{items.length}</span>
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-ink-mid">
                  {meta.caption}
                </p>
              </div>
              <ul className="space-y-2">
                {items.slice(0, 8).map((a: any, i: number) => {
                  const ownerBlank = isBlankOwner(a);
                  const isHighlighted = highlightSet?.has(
                    (a.asset_id ?? "").toString().trim(),
                  );
                  const highlight = isHighlighted ? "ring-2 ring-accent" : "";
                  return (
                    <li key={a.asset_id ?? `${col}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedAsset(a)}
                        className={`block w-full cursor-pointer rounded-xl border p-3 text-left transition-shadow hover:shadow-sm ${meta.bg} ${meta.border} ${meta.text} ${highlight}`}
                      >
                        <p className="font-mono text-[11px] opacity-80">
                          {a.asset_id ?? "—"}
                        </p>
                        <p className="mt-1 text-xs font-medium leading-tight">
                          {a.asset_type ?? "—"}
                        </p>
                        <p className="text-[11px] opacity-70 leading-tight">
                          {a.location ?? a.building ?? "—"}
                        </p>
                        <div className="mt-2 text-[11px]">
                          {ownerBlank ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                              Owner unclear
                            </span>
                          ) : (
                            <span className="opacity-70">Owner: {a.owner_name}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {items.length > 8 && (
                  <li className="text-center text-[11px] text-ink-mid py-1">
                    + {items.length - 8} more
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <AssetDetailPanel
        asset={selectedAsset}
        blockerMap={blockerMap}
        xer={project.uploads.xer}
        onClose={() => setSelectedAsset(null)}
        onOpenBlocker={(id) => {
          setSelectedAsset(null);
          onOpenBlocker(id);
        }}
      />
    </section>
  );
}

function Header({
  role,
  count,
  viewingAs,
}: {
  role: ViewingAs["role"];
  count: number;
  viewingAs: ViewingAs;
}) {
  const captions: Record<string, string> = {
    "main-contractor": `${count} assets across the register — full ownership view.`,
    subcontractor: `${count} assets owned by ${viewingAs.orgName} or on your interfaces.`,
    client: `${count} assets — read-only. Yellow stage is awaiting your witness.`,
    design: `${count} assets with open design RFIs.`,
    originating: `${count} assets across the register.`,
  };
  return (
    <header>
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 32, lineHeight: 1.1 }}
      >
        Assets
      </h1>
      <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
        {captions[role] ?? `${count} assets · ${roleLabel(role)} view.`}
      </p>
    </header>
  );
}
