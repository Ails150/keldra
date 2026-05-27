"use client";

import { useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { filterAssetsByRole, getLinkedBlockers, roleLabel } from "../utils";
import { stageMeta } from "../lib/cx-stages";
import AssetDetailPanel from "./asset-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

type Zone = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Stylised top-down layout of DUB-12 Building 4 (880×520 viewBox).
const ZONES: Zone[] = [
  { id: "mer1", label: "MER1 Main Electrical Room", x: 20, y: 40, w: 280, h: 200 },
  { id: "roof", label: "Roof above Colo", x: 320, y: 40, w: 240, h: 120 },
  { id: "admin", label: "Admin Plant", x: 580, y: 40, w: 200, h: 200 },
  { id: "mgr2", label: "MGR2", x: 320, y: 180, w: 240, h: 60 },
  { id: "colo1", label: "Colo Hall 1", x: 20, y: 270, w: 380, h: 200 },
  { id: "colo2", label: "Colo Hall 2", x: 420, y: 270, w: 360, h: 200 },
  { id: "other", label: "Other", x: 590, y: 478, w: 190, h: 34 },
];

function zoneForLocation(loc: string): string {
  const s = (loc ?? "").toString().toLowerCase();
  if (s.includes("mer1")) return "mer1";
  if (s.includes("roof")) return "roof";
  if (s.includes("admin")) return "admin";
  if (s.includes("mgr2")) return "mgr2";
  if (s.includes("colo hall 2")) return "colo2";
  if (s.includes("colo hall 1")) return "colo1";
  if (s.includes("colo")) return "colo1";
  return "other";
}

// Dot fill/stroke by Cx stage; owner-unclear assets render grey + dashed.
function dotStyle(asset: any): { fill: string; stroke: string; dashed: boolean } {
  const owner = (asset.owner_name ?? "").toString().trim();
  if (owner === "") return { fill: "#B4B2A9", stroke: "#807E76", dashed: true };
  const m = stageMeta(asset.current_stage);
  return { fill: m.dotFill, stroke: m.dotStroke, dashed: false };
}

function zoneTint(count: number): { bg: string; stroke: string; text: string } {
  if (count >= 6) return { bg: "#FCEBEB", stroke: "#A32D2D", text: "#A32D2D" };
  if (count >= 3) return { bg: "#FAEEDA", stroke: "#854F0B", text: "#854F0B" };
  return { bg: "#EAF3DE", stroke: "#3B6D11", text: "#3B6D11" };
}

function shortId(id: string): string {
  const parts = (id ?? "").toString().split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : id;
}

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
  onAlertAction?: (target: string) => void;
  highlightZone?: string | null;
};

export default function MapView({
  project,
  viewingAs,
  blockerMap,
  onOpenBlocker,
  onAlertAction,
  highlightZone,
}: Props) {
  const [activeAsset, setActiveAsset] = useState<any | null>(null);

  const roleAssets = useMemo(
    () =>
      filterAssetsByRole(
        project.uploads.assets,
        viewingAs.role,
        viewingAs.orgName,
      ),
    [project.uploads.assets, viewingAs.role, viewingAs.orgName],
  );

  // Per-zone: which assets sit there, open-blocker count + combined £/day, and
  // whether the zone is in the current role's scope.
  const zoneData = useMemo(() => {
    const byZone = new Map<string, any[]>();
    for (const a of roleAssets) {
      const z = zoneForLocation(a.location ?? a.building ?? "");
      const arr = byZone.get(z) ?? [];
      arr.push(a);
      byZone.set(z, arr);
    }
    const seesAll =
      viewingAs.role === "main-contractor" || viewingAs.role === "client";

    return ZONES.map((zone) => {
      const assets = byZone.get(zone.id) ?? [];
      const ids = new Set(
        assets.map((a) => (a.asset_id ?? "").toString().trim()),
      );
      const blockers = blockerMap
        ? Object.values(blockerMap).filter(
            (b) =>
              b.state !== "closed" &&
              b.linked_assets.some((id) => ids.has(id.trim())),
          )
        : [];
      const cost = blockers.reduce((s, b) => s + b.cost_per_day, 0);
      const inScope = seesAll || assets.length > 0;
      return { zone, assets, blockers, count: blockers.length, cost, inScope };
    }).filter((z) => z.zone.id !== "other" || z.assets.length > 0);
  }, [roleAssets, blockerMap, viewingAs.role]);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 28, lineHeight: 1.15 }}
          >
            DUB-12 Building 4 · Site map
          </h1>
          <p
            className="mt-1 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 14 }}
          >
            Spatial accountability · viewing as {viewingAs.orgName} ·{" "}
            {roleLabel(viewingAs.role)}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[11px] text-ink-mid">
          <div className="flex items-center gap-3">
            <span className="font-semibold uppercase tracking-wide">Zone heat</span>
            <Swatch color="#A32D2D" label="6+" />
            <Swatch color="#854F0B" label="3–5" />
            <Swatch color="#3B6D11" label="0–2" />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold uppercase tracking-wide">Asset</span>
            <Dot color="#A32D2D" label="RT" />
            <Dot color="#F4A340" label="On YT" />
            <Dot color="#5BA13B" label="On GT" />
            <Dot color="#B4B2A9" label="Owner unclear" />
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-warm">
        <svg
          viewBox="0 0 880 520"
          className="w-full"
          style={{ height: 600 }}
          role="img"
          aria-label="DUB-12 site map"
        >
          {zoneData.map(({ zone, assets, blockers, count, cost, inScope }) => {
            const tint = zoneTint(count);
            const highlighted = highlightZone === zone.id;
            if (!inScope) {
              return (
                <g key={zone.id} opacity={0.3}>
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.w}
                    height={zone.h}
                    rx={10}
                    fill="#EFEAF2"
                    stroke="#C9C3D0"
                    strokeWidth={0.5}
                  />
                  <text x={zone.x + 12} y={zone.y + 22} fontSize={13} fill="#7A7580">
                    {zone.label}
                  </text>
                  <text x={zone.x + 12} y={zone.y + 40} fontSize={10} fill="#9A95A0">
                    Not in {viewingAs.orgName} scope
                  </text>
                </g>
              );
            }
            const topBlockers = blockers
              .slice()
              .sort((a, b) => b.cost_per_day - a.cost_per_day)
              .slice(0, 2)
              .map((b) => `• ${b.description}`)
              .join("\n");
            const zoneTip = `${zone.label}\n${count} open blocker${count === 1 ? "" : "s"} · ${GBP.format(cost)}/day${topBlockers ? `\n${topBlockers}` : ""}`;
            return (
              <g key={zone.id}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={10}
                  fill={tint.bg}
                  stroke={highlighted ? "#8a3dd6" : tint.stroke}
                  strokeWidth={highlighted ? 2.5 : 0.5}
                  className="cursor-pointer"
                  onClick={() => onAlertAction?.("tab:constraints")}
                >
                  <title>{zoneTip}</title>
                </rect>
                <text
                  x={zone.x + 12}
                  y={zone.y + 22}
                  fontSize={14}
                  fontFamily="var(--font-fraunces)"
                  fill={tint.text}
                  className="pointer-events-none"
                >
                  {zone.label}
                </text>
                <text
                  x={zone.x + 12}
                  y={zone.y + 38}
                  fontSize={10}
                  fill={tint.text}
                  opacity={0.8}
                  className="pointer-events-none"
                >
                  {count} open blocker{count === 1 ? "" : "s"} ·{" "}
                  {GBP.format(cost)}/day
                </text>

                {assets.map((a, i) => {
                  const cols = Math.min(4, Math.max(1, assets.length));
                  const rows = Math.ceil(assets.length / cols);
                  const padX = 20;
                  const padTop = 50;
                  const padBottom = 16;
                  const cellW = (zone.w - 2 * padX) / cols;
                  const cellH = Math.max(
                    24,
                    (zone.h - padTop - padBottom) / rows,
                  );
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const cx = zone.x + padX + (col + 0.5) * cellW;
                  const cy = zone.y + padTop + (row + 0.5) * cellH;

                  const open = getLinkedBlockers(a, blockerMap).filter(
                    (b) => b.state !== "closed",
                  );
                  const r = open.length >= 3 ? 11 : open.length >= 1 ? 9 : 6;
                  const cd = open.reduce((s, b) => s + b.cost_per_day, 0);
                  const st = dotStyle(a);
                  const tip = `${a.asset_id} · ${a.asset_type}\nStage: ${a.current_stage || "—"}\nOwner: ${a.owner_name || "Owner unclear"}\n${open.length} open blocker${open.length === 1 ? "" : "s"}${cd ? ` · ${GBP.format(cd)}/day` : ""}`;

                  return (
                    <g
                      key={a.asset_id ?? i}
                      className="cursor-pointer"
                      onClick={() => setActiveAsset(a)}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={st.fill}
                        stroke={st.stroke}
                        strokeWidth={1.4}
                        strokeDasharray={st.dashed ? "3 2" : undefined}
                      >
                        <title>{tip}</title>
                      </circle>
                      <text
                        x={cx}
                        y={cy + r + 9}
                        fontSize={8}
                        textAnchor="middle"
                        fill={st.stroke}
                        className="pointer-events-none"
                      >
                        {shortId(a.asset_id ?? "")}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-center text-xs text-ink-mid">
        Click any zone or asset · live state from blocker chain · 0 secs latency
      </p>

      <AssetDetailPanel
        asset={activeAsset}
        blockerMap={blockerMap}
        xer={project.uploads.xer}
        onClose={() => setActiveAsset(null)}
        onOpenBlocker={(id) => {
          setActiveAsset(null);
          onOpenBlocker(id);
        }}
      />
    </section>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
