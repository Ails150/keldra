"use client";

import { useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { filterAssetsByRole, isBlankOwner, roleLabel } from "../utils";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLUMN_ORDER = [
  "Designed",
  "Delivered",
  "Installed",
  "Red-tag candidate",
  "Red-tagged",
  "Yellow",
  "Green",
  "Other",
];

function bucketFor(stage: string): string {
  const s = (stage ?? "").toString().trim();
  if (!s) return "Other";
  const lower = s.toLowerCase();
  if (lower.includes("delivered") && lower.includes("not installed")) return "Delivered";
  if (lower.includes("delivered")) return "Delivered";
  if (lower.includes("installed")) return "Installed";
  if (lower.includes("red-tag candidate") || lower === "red candidate") return "Red-tag candidate";
  if (lower.includes("red")) return "Red-tagged";
  if (lower.includes("yellow")) return "Yellow";
  if (lower.includes("green") || lower.includes("handover")) return "Green";
  if (lower.includes("design")) return "Designed";
  return "Other";
}

function stageCardClasses(stage: string): string {
  const s = (stage || "").toLowerCase();
  if (s.includes("delivered") && s.includes("not installed"))
    return "bg-zinc-100 border-zinc-200 text-zinc-700";
  if (s.includes("green") || s.includes("handover"))
    return "bg-green-50 border-green-200 text-green-900";
  if (s.includes("yellow")) return "bg-yellow-50 border-yellow-200 text-yellow-900";
  if (s.includes("red")) return "bg-red-50 border-red-200 text-red-900";
  return "bg-paper-card border-paper-line text-ink";
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

  const buckets = new Map<string, any[]>();
  COLUMN_ORDER.forEach((b) => buckets.set(b, []));
  assets.forEach((a: any) => {
    const b = bucketFor(a.current_stage ?? "");
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(a);
  });

  const visibleCols = COLUMN_ORDER.filter((c) => (buckets.get(c)?.length ?? 0) > 0);

  if (visibleCols.length === 0) {
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

      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${visibleCols.length}, minmax(220px, 1fr))` }}>
        {visibleCols.map((col) => {
          const items = buckets.get(col) ?? [];
          return (
            <div
              key={col}
              className="rounded-2xl border border-paper-line bg-paper-warm/40 p-3"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs font-semibold text-ink">{col}</p>
                <span className="text-xs text-ink-mid">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.slice(0, 8).map((a: any, i: number) => {
                  const ownerBlank = isBlankOwner(a);
                  const stage = a.current_stage ?? col;
                  const isHighlighted = highlightSet?.has((a.asset_id ?? "").toString().trim());
                  const highlight = isHighlighted
                    ? "ring-2 ring-accent"
                    : role === "client" && col === "Yellow"
                      ? "ring-2 ring-yellow-400"
                      : "";
                  return (
                    <li key={a.asset_id ?? `${col}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedAsset(a)}
                        className={`block w-full cursor-pointer rounded-xl border p-3 text-left transition-shadow hover:shadow-sm ${stageCardClasses(stage)} ${highlight}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-[11px] opacity-80">{a.asset_id ?? "—"}</p>
                          {role === "client" && col === "Yellow" && (
                            <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-[10px] font-semibold text-yellow-900">
                              Awaiting witness
                            </span>
                          )}
                        </div>
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
