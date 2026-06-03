"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { roleLabel } from "../utils";
import { BRAND } from "@/lib/brand";
import {
  MAP_STAGES,
  mapStageMeta,
  taskMapStage,
} from "../lib/cx-stages";
import { type Baseline, companyName, loadBaseline } from "../lib/baseline-seed";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// Stylised top-down layout of MER. Each zone is a critical room (or, for the
// BU rooms, a group) read straight from the baseline; dots are baseline tasks
// whose affects_room points here.
type Zone = {
  id: string;
  label: string;
  // Baseline room codes that belong to this zone; `bu: true` matches every BU-* room.
  codes: string[];
  bu?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

const ZONES: Zone[] = [
  { id: "mmr1", label: "MMR1", codes: ["MMR1"], x: 20, y: 44, w: 200, h: 150 },
  { id: "mmr2", label: "MMR2", codes: ["MMR2"], x: 240, y: 44, w: 200, h: 150 },
  { id: "mer1-lv", label: "MER1 LV", codes: ["MER1-LV"], x: 460, y: 44, w: 180, h: 150 },
  { id: "mer2-lv", label: "MER2 LV", codes: ["MER2-LV"], x: 660, y: 44, w: 180, h: 150 },
  { id: "upm1", label: "UPM1", codes: ["UPM1"], x: 20, y: 214, w: 200, h: 150 },
  { id: "upm2", label: "UPM2", codes: ["UPM2"], x: 240, y: 214, w: 200, h: 150 },
  { id: "earth-m1", label: "MER1 Earth Bar", codes: ["EARTH-M1"], x: 460, y: 214, w: 180, h: 150 },
  { id: "earth-m2", label: "MER2 Earth Bar", codes: ["EARTH-M2"], x: 660, y: 214, w: 180, h: 150 },
  { id: "bu", label: "BU rooms", codes: [], bu: true, x: 20, y: 384, w: 620, h: 210 },
  { id: "sec-colo", label: "Security COLO", codes: ["SEC-COLO"], x: 660, y: 384, w: 180, h: 210 },
];

function zoneMatches(zone: Zone, code: string | null): boolean {
  if (!code) return false;
  if (zone.bu) return code.startsWith("BU-");
  return zone.codes.includes(code);
}

// Heat by number of at-risk tasks (blocked / should-be-running) in the room.
function zoneTint(count: number): { bg: string; stroke: string; text: string } {
  if (count >= 4) return { bg: BRAND.dangerBg, stroke: BRAND.dangerInk, text: BRAND.dangerInk };
  if (count >= 2) return { bg: BRAND.warningBg, stroke: BRAND.warningInk, text: BRAND.warningInk };
  return { bg: BRAND.successBg, stroke: BRAND.successInk, text: BRAND.successInk };
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
  viewingAs,
  onAlertAction,
  highlightZone,
}: Props) {
  const router = useRouter();
  const [baseline, setBaseline] = useState<Baseline>(loadBaseline);
  useEffect(() => setBaseline(loadBaseline()), []);

  const seesAll = viewingAs.role === "main-contractor" || viewingAs.role === "client";
  const orgSlug = useMemo(
    () => baseline.companies.find((c) => c.name === viewingAs.orgName)?.slug ?? null,
    [baseline.companies, viewingAs.orgName],
  );

  const zoneData = useMemo(() => {
    return ZONES.map((zone) => {
      const tasks = baseline.tasks.filter((t) => zoneMatches(zone, t.affects_room));
      const atRisk = tasks.filter(
        (t) => t.status === "blocked" || t.status === "not_started_should_be",
      );
      const cost = atRisk.reduce((s, t) => s + t.cost_per_day, 0);
      const ownsHere =
        !!orgSlug &&
        tasks.some(
          (t) => t.responsible_company === orgSlug || t.blocking_company === orgSlug,
        );
      const inScope = seesAll || ownsHere;
      return { zone, tasks, count: atRisk.length, cost, inScope };
    });
  }, [baseline.tasks, orgSlug, seesAll]);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 28, lineHeight: 1.15 }}
          >
            MER · Site map
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
            <span className="font-semibold uppercase tracking-wide">Room heat</span>
            <Swatch color={BRAND.dangerInk} label="4+ at risk" />
            <Swatch color={BRAND.warningInk} label="2–3" />
            <Swatch color={BRAND.successInk} label="0–1" />
          </div>
          <div className="flex max-w-xl flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span className="font-semibold uppercase tracking-wide">Cx stage</span>
            {MAP_STAGES.map((s) => (
              <Dot key={s.key} color={s.fill} label={s.label} />
            ))}
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-warm">
        <svg
          viewBox="0 0 880 620"
          className="w-full"
          style={{ height: 640 }}
          role="img"
          aria-label="MER site map"
        >
          {zoneData.map(({ zone, tasks, count, cost, inScope }) => {
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
                    fill={BRAND.cream}
                    stroke={BRAND.paperLine}
                    strokeWidth={0.5}
                  />
                  <text x={zone.x + 12} y={zone.y + 22} fontSize={13} fill={BRAND.inkMuted}>
                    {zone.label}
                  </text>
                  <text x={zone.x + 12} y={zone.y + 40} fontSize={10} fill={BRAND.inkMuted}>
                    Not in {viewingAs.orgName} scope
                  </text>
                </g>
              );
            }
            const zoneTip = `${zone.label}\n${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${count} at risk · ${GBP.format(cost)}/day`;
            return (
              <g key={zone.id}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={10}
                  fill={tint.bg}
                  stroke={highlighted ? BRAND.purple : tint.stroke}
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
                  opacity={0.85}
                  className="pointer-events-none"
                >
                  {count > 0
                    ? `${count} at risk · ${GBP.format(cost)}/day`
                    : tasks.length > 0
                      ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} · on track`
                      : "No tasks mapped"}
                </text>

                {tasks.map((t, i) => {
                  const cols = Math.min(4, Math.max(1, tasks.length));
                  const rows = Math.ceil(tasks.length / cols);
                  const padX = 22;
                  const padTop = 52;
                  const padBottom = 18;
                  const cellW = (zone.w - 2 * padX) / cols;
                  const cellH = Math.max(28, (zone.h - padTop - padBottom) / rows);
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const cx = zone.x + padX + (col + 0.5) * cellW;
                  const cy = zone.y + padTop + (row + 0.5) * cellH;

                  const stage = mapStageMeta(taskMapStage(t));
                  const r =
                    t.status === "blocked" ? 11 : t.status === "not_started_should_be" ? 9 : 7;
                  const tip = `${t.activity_id} · ${t.name}\nStage: ${stage.label}\n${t.cost_per_day > 0 ? `${GBP.format(t.cost_per_day)}/day · ` : ""}held by ${companyName(baseline, t.blocking_company ?? t.responsible_company)}`;

                  return (
                    <g
                      key={t.activity_id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/tasks/${t.activity_id}`)}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={stage.fill}
                        stroke={BRAND.ink}
                        strokeWidth={1.2}
                      >
                        <title>{tip}</title>
                      </circle>
                      <text
                        x={cx}
                        y={cy + r + 9}
                        fontSize={7.5}
                        textAnchor="middle"
                        fill={BRAND.ink}
                        className="pointer-events-none"
                      >
                        {t.activity_id}
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
        Click any room or task · live from the MER baseline · site install
        starts 17 Aug 26, so every dot is still off-site
      </p>
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
