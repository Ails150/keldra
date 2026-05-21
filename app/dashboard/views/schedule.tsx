"use client";

import { useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { Blocker, BlockerMap } from "../lib/blocker-state";
import {
  type AssetStatus,
  daysBetween,
  filterAssetsByRole,
  getAssetActualStatus,
  getAssetPlannedEnd,
  getLinkedBlockers,
  groupAssetsByWorkPackage,
  worstStatus,
} from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const WEEKS = 12;
const WINDOW_DAYS = WEEKS * 7;

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const STATUS_BAR: Record<
  AssetStatus,
  { bg: string; ring: string; label: string }
> = {
  "on-track": { bg: "bg-green-500", ring: "ring-green-500", label: "On track" },
  "in-progress": { bg: "bg-accent", ring: "ring-accent", label: "In progress" },
  "at-risk": { bg: "bg-yellow-500", ring: "ring-yellow-500", label: "At risk" },
  slipping: { bg: "bg-orange-500", ring: "ring-orange-500", label: "Slipping" },
  blocked: { bg: "bg-red-500", ring: "ring-red-500", label: "Blocked" },
  stalled: {
    bg: "[background:repeating-linear-gradient(45deg,#a1a1aa,#a1a1aa_6px,#fca5a5_6px,#fca5a5_12px)]",
    ring: "ring-zinc-400",
    label: "Stalled",
  },
};

type Mode = "by-job" | "by-task";

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
};

export default function ScheduleView({
  project,
  viewingAs,
  blockerMap,
  onOpenBlocker,
}: Props) {
  const [mode, setMode] = useState<Mode>("by-job");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterOrg, setFilterOrg] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");

  const today = useMemo(() => new Date(), []);

  const assets = useMemo(
    () =>
      filterAssetsByRole(
        project.uploads.assets,
        viewingAs.role,
        viewingAs.orgName,
      ),
    [project.uploads.assets, viewingAs.role, viewingAs.orgName],
  );

  // Per-asset derived data.
  const enriched = useMemo(
    () =>
      assets.map((a: any) => {
        const planned = getAssetPlannedEnd(a, today);
        const status = getAssetActualStatus(a, blockerMap);
        const linked = getLinkedBlockers(a, blockerMap);
        return {
          asset: a,
          plannedEnd: planned,
          daysUntil: daysBetween(planned, today),
          status,
          linked,
        };
      }),
    [assets, blockerMap, today],
  );

  const orgOptions = useMemo(() => {
    const set = new Set<string>();
    enriched.forEach((e) => {
      const org = (e.asset.owner_org ?? "").toString().trim();
      if (org) set.add(org);
    });
    return Array.from(set).sort();
  }, [enriched]);

  if (!project.uploads.assets || project.uploads.assets.length === 0) {
    return <EmptyState />;
  }

  const projectName =
    (project.project.name?.trim() || "DUB-12 Building 4").toUpperCase();

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-deep"
            style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
          >
            Programme · {projectName}
          </p>
          <h1
            className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 28, lineHeight: 1.15 }}
          >
            Schedule
          </h1>
          <p
            className="mt-1 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 14 }}
          >
            What&apos;s planned, what&apos;s slipping, and why
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-paper-line bg-paper-card p-1">
          {(["by-job", "by-task"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-ink text-paper"
                  : "text-ink-mid hover:text-ink"
              }`}
            >
              {m === "by-job" ? "By job" : "By task"}
            </button>
          ))}
        </div>
      </header>

      {mode === "by-task" && (
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Org"
            value={filterOrg}
            onChange={setFilterOrg}
            options={[
              { value: "all", label: "All orgs" },
              ...orgOptions.map((o) => ({ value: o, label: o })),
            ]}
          />
          <FilterSelect
            label="Stage"
            value={filterStage}
            onChange={setFilterStage}
            options={[
              { value: "all", label: "All stages" },
              { value: "blocked", label: "Blocked" },
              { value: "red", label: "Red / slipping" },
              { value: "yellow", label: "Yellow / at-risk" },
              { value: "green", label: "Green / on-track" },
            ]}
          />
        </div>
      )}

      <TimelineHeader today={today} />

      {mode === "by-job" ? (
        <ByJobRows
          enriched={enriched}
          today={today}
          expanded={expanded}
          onToggleExpand={(key) => {
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onOpenBlocker={onOpenBlocker}
        />
      ) : (
        <ByTaskRows
          enriched={enriched}
          today={today}
          filterOrg={filterOrg}
          filterStage={filterStage}
          onOpenBlocker={onOpenBlocker}
        />
      )}

      <Legend />
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto max-w-3xl px-8 py-16 text-center">
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Schedule
      </h1>
      <p className="mt-3 text-sm text-ink-mid">
        No assets uploaded yet —{" "}
        <a href="/onboarding" className="text-accent hover:text-accent-deep">
          return to the wizard
        </a>{" "}
        to import an asset register.
      </p>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-mid">
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border-soft bg-paper-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- timeline header ----------

function TimelineHeader({ today }: { today: Date }) {
  const ticks = Array.from({ length: WEEKS + 1 }, (_, i) => {
    const d = new Date(today.getTime() + i * 7 * 86400000);
    return {
      week: i,
      label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    };
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
      <div className="flex">
        <div className="w-[240px] flex-shrink-0 border-r border-paper-line bg-paper px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
          Work-package / asset
        </div>
        <div className="relative flex-1 px-3 py-3">
          <div className="relative h-10">
            {ticks.map((t) => (
              <div
                key={t.week}
                className="absolute top-0 flex h-full flex-col items-start gap-1"
                style={{ left: `${(t.week / WEEKS) * 100}%` }}
              >
                <span className="block h-2 w-px bg-paper-line" />
                <span
                  className="font-mono text-[10px] text-ink-mid"
                  style={{ transform: "translateX(2px)" }}
                >
                  {t.label}
                </span>
              </div>
            ))}
            <div
              className="absolute top-0 h-full border-l-2 border-dashed border-accent"
              style={{ left: "0%" }}
              aria-hidden
            />
            <span
              className="absolute font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-deep"
              style={{ left: 4, top: 22 }}
            >
              Today
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- by-task ----------

type EnrichedAsset = {
  asset: any;
  plannedEnd: Date;
  daysUntil: number;
  status: AssetStatus;
  linked: Blocker[];
};

function matchesStageFilter(s: AssetStatus, f: string): boolean {
  if (f === "all") return true;
  if (f === "blocked") return s === "blocked";
  if (f === "red") return s === "slipping" || s === "blocked";
  if (f === "yellow") return s === "at-risk";
  if (f === "green") return s === "on-track";
  return true;
}

function ByTaskRows({
  enriched,
  today,
  filterOrg,
  filterStage,
  onOpenBlocker,
}: {
  enriched: EnrichedAsset[];
  today: Date;
  filterOrg: string;
  filterStage: string;
  onOpenBlocker: (id: string) => void;
}) {
  const rows = useMemo(
    () =>
      enriched
        .filter((e) => {
          if (filterOrg !== "all") {
            const org = (e.asset.owner_org ?? "").toString().trim();
            if (org !== filterOrg) return false;
          }
          return matchesStageFilter(e.status, filterStage);
        })
        .sort((a, b) => a.plannedEnd.getTime() - b.plannedEnd.getTime()),
    [enriched, filterOrg, filterStage],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
        No assets match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
      <ul className="divide-y divide-paper-line">
        {rows.map((e) => (
          <Row
            key={e.asset.asset_id ?? Math.random()}
            label={
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-ink-mid">
                  {e.asset.asset_id ?? "—"}
                </p>
                <p className="truncate text-xs font-medium text-ink">
                  {e.asset.asset_type ?? "—"}
                </p>
              </div>
            }
            today={today}
            startDays={0}
            endDays={Math.max(0, e.daysUntil)}
            status={e.status}
            barText={e.asset.asset_id ?? ""}
            linked={e.linked}
            plannedEnd={e.plannedEnd}
            onOpenBlocker={onOpenBlocker}
            onClickBar={() => {
              if (e.linked.length > 0) onOpenBlocker(e.linked[0].id);
              else
                alert(
                  "Asset detail view — pilot week 5 deliverable.",
                );
            }}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------- by-job ----------

type GroupRow = {
  key: string;
  items: EnrichedAsset[];
  minDays: number;
  maxDays: number;
  status: AssetStatus;
};

function ByJobRows({
  enriched,
  today,
  expanded,
  onToggleExpand,
  onOpenBlocker,
}: {
  enriched: EnrichedAsset[];
  today: Date;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onOpenBlocker: (id: string) => void;
}) {
  const groups = useMemo<GroupRow[]>(() => {
    const grouped = groupAssetsByWorkPackage(enriched.map((e) => e.asset));
    const out: GroupRow[] = [];
    for (const [key, assets] of grouped.entries()) {
      const items = assets
        .map((a) => enriched.find((e) => e.asset === a))
        .filter((e): e is EnrichedAsset => Boolean(e));
      if (items.length === 0) continue;
      const days = items.map((i) => i.daysUntil);
      out.push({
        key,
        items,
        minDays: Math.min(...days),
        maxDays: Math.max(...days),
        status: worstStatus(items.map((i) => i.status)),
      });
    }
    return out.sort((a, b) => a.minDays - b.minDays);
  }, [enriched]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
        No assets visible from this seat.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
      <ul className="divide-y divide-paper-line">
        {groups.map((g) => {
          const isOpen = expanded.has(g.key);
          const blockedCount = g.items.filter((i) => i.status === "blocked")
            .length;
          return (
            <li key={g.key}>
              <Row
                today={today}
                label={
                  <button
                    type="button"
                    onClick={() => onToggleExpand(g.key)}
                    className="flex items-start gap-2 text-left"
                  >
                    <span className="mt-0.5 text-ink-mid text-xs">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        {g.key}
                      </p>
                      <p className="font-mono text-[10px] text-ink-mid">
                        {g.items.length}{" "}
                        {g.items.length === 1 ? "asset" : "assets"}
                        {blockedCount > 0 && ` · ${blockedCount} blocked`}
                      </p>
                    </span>
                  </button>
                }
                startDays={g.minDays}
                endDays={g.maxDays}
                status={g.status}
                barText={`${g.items.length} assets`}
                linked={[]}
                plannedEnd={
                  new Date(today.getTime() + g.maxDays * 86400000)
                }
                onOpenBlocker={onOpenBlocker}
                onClickBar={() => onToggleExpand(g.key)}
              />
              {isOpen && (
                <ul className="divide-y divide-paper-line bg-paper-warm/30">
                  {g.items
                    .slice()
                    .sort((a, b) => a.daysUntil - b.daysUntil)
                    .map((e) => (
                      <Row
                        key={e.asset.asset_id ?? Math.random()}
                        indented
                        today={today}
                        label={
                          <div className="min-w-0 pl-5">
                            <p className="font-mono text-[10px] text-ink-mid">
                              {e.asset.asset_id ?? "—"}
                            </p>
                            <p className="truncate text-xs text-ink">
                              {e.asset.asset_type ?? "—"}
                            </p>
                          </div>
                        }
                        startDays={0}
                        endDays={Math.max(0, e.daysUntil)}
                        status={e.status}
                        barText={e.asset.asset_id ?? ""}
                        linked={e.linked}
                        plannedEnd={e.plannedEnd}
                        onOpenBlocker={onOpenBlocker}
                        onClickBar={() => {
                          if (e.linked.length > 0)
                            onOpenBlocker(e.linked[0].id);
                          else
                            alert(
                              "Asset detail view — pilot week 5 deliverable.",
                            );
                        }}
                      />
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- shared row + bar ----------

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function Row({
  label,
  today,
  startDays,
  endDays,
  status,
  barText,
  linked,
  plannedEnd,
  onClickBar,
  onOpenBlocker,
  indented,
}: {
  label: React.ReactNode;
  today: Date;
  startDays: number;
  endDays: number;
  status: AssetStatus;
  barText: string;
  linked: Blocker[];
  plannedEnd: Date;
  onClickBar: () => void;
  onOpenBlocker: (id: string) => void;
  indented?: boolean;
}) {
  const left = clampPercent((Math.max(0, startDays) / WINDOW_DAYS) * 100);
  const rightEdge = clampPercent((Math.max(0, endDays) / WINDOW_DAYS) * 100);
  const width = Math.max(4, rightEdge - left);

  const overdue = endDays < 0;
  const slippedDays = overdue ? Math.abs(endDays) : 0;
  const bar = STATUS_BAR[status];
  const primaryBlocker = linked[0];
  const tooltip = [
    barText || "Asset",
    `Stage: ${status}`,
    `Planned end: ${plannedEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
    overdue ? `Overdue ${slippedDays}d` : `${endDays}d until planned end`,
    linked.length > 0
      ? `${linked.length} linked blocker${linked.length === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`group flex items-stretch transition-colors hover:bg-paper-warm/60 ${
        indented ? "" : ""
      }`}
    >
      <div className="w-[240px] flex-shrink-0 border-r border-paper-line bg-paper px-4 py-3">
        {label}
      </div>
      <div className="relative flex-1 px-3 py-3">
        <div className="relative h-6">
          <div
            className="absolute top-0 h-full border-l-2 border-dashed border-accent/40"
            style={{ left: "0%" }}
            aria-hidden
          />
          <button
            type="button"
            onClick={onClickBar}
            title={tooltip}
            className={`absolute top-0 flex h-6 cursor-pointer items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white transition-shadow hover:ring-2 hover:ring-offset-1 ${bar.bg} ${bar.ring}`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
            }}
          >
            <span className="truncate">{barText}</span>
          </button>

          {overdue && (
            <span
              className="absolute top-0 -translate-y-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-700"
              style={{ left: `calc(${left}% + ${width}% + 6px)` }}
            >
              Overdue {slippedDays}d
            </span>
          )}
        </div>

        {primaryBlocker && (
          <button
            type="button"
            onClick={() => onOpenBlocker(primaryBlocker.id)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-red-100"
          >
            <span className="font-semibold text-red-700">Why:</span>
            <span className="flex-1 truncate text-ink">
              {primaryBlocker.description}
              {primaryBlocker.waiting_on_person && (
                <span className="text-ink-mid">
                  {" "}
                  · Waiting on {primaryBlocker.waiting_on_person}
                </span>
              )}
            </span>
            <span className="font-mono text-[10px] font-semibold text-red-700">
              {GBP.format(primaryBlocker.cost_per_day)}/day
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- legend ----------

function Legend() {
  const items: { key: AssetStatus; copy: string }[] = [
    { key: "on-track", copy: "On track" },
    { key: "in-progress", copy: "In progress" },
    { key: "at-risk", copy: "At risk" },
    { key: "slipping", copy: "Slipping" },
    { key: "blocked", copy: "Blocked (linked to open blocker)" },
    { key: "stalled", copy: "Stalled" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-mid">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block h-3 w-5 rounded-sm ${STATUS_BAR[i.key].bg}`}
          />
          {i.copy}
        </span>
      ))}
    </div>
  );
}
