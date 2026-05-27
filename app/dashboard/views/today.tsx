"use client";

import Link from "next/link";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { roleLabel } from "../utils";
import { BRAND } from "@/lib/brand";
import {
  BASELINE_TASKS,
  BU_TARGET,
  COMPANIES,
  MILESTONES,
  SITE_DIARY,
  type BaselineTask,
  affectsBu,
  companyColour,
  companyName,
  companyRollups,
  daysOpen,
  roomByCode,
  varianceTasks,
  workingDaysUntil,
} from "../lib/baseline-seed";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function roomBadge(code: string | null): { label: string; bg: string } | null {
  const r = roomByCode(code);
  if (!r) return null;
  const bg =
    r.tag === "BU"
      ? "bg-red-100 text-red-700"
      : r.tag === "Earth"
        ? "bg-blue-100 text-blue-800"
        : r.tag === "Security"
          ? "bg-purple-100 text-purple-800"
          : "bg-amber-100 text-amber-800";
  return { label: r.code, bg };
}

export default function TodayView({
  project,
  viewingAs,
  blockerMap: _blockerMap,
  onOpenBlocker: _onOpenBlocker,
  onAlertAction,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
  onAlertAction?: (target: string) => void;
}) {
  const variance = varianceTasks();
  const rollups = companyRollups();
  const buDays = workingDaysUntil(BU_TARGET);

  const plannedTotal = SITE_DIARY.manpower.reduce((s, m) => s + m.men, 0);
  const activeTasks = BASELINE_TASKS.filter(
    (t) => t.status === "blocked" || t.status === "on_track",
  ).length;

  const priority = BASELINE_TASKS.filter(
    (t) => affectsBu(t) && t.cost_per_day > 0,
  )
    .sort((a, b) => b.cost_per_day - a.cost_per_day)
    .slice(0, 5);

  const topRollups = rollups.slice(0, 6);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-7">
      {/* (A) BU countdown strip */}
      <div
        className="rounded-2xl px-6 py-5"
        style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: BRAND.cream, opacity: 0.7 }}
            >
              Beneficial Use target (11 rooms)
            </p>
            <p
              className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold"
              style={{ fontSize: 30, lineHeight: 1.1 }}
            >
              02 Dec 2026 · {buDays} working days remaining
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "Power on Grangecastle · 03 Sep 26",
              "Yellow Tag · 04 Nov 26",
              "Green Tag · 02 Dec 26",
              "IST 02 Dec – 28 Jan · TOC 29 Jan – 08 Apr 27",
            ].map((c) => (
              <span
                key={c}
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  color: BRAND.cream,
                  border: `1px solid ${BRAND.purple}`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* (B) Baseline variance card */}
      <div>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Why haven&apos;t you started these?
        </h1>
        <p className="mt-1 text-sm text-ink-mid">
          Tasks the baseline says should be running today.
        </p>
        <p
          className="font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 13 }}
        >
          Programme: Ardmac DUB-16, revision 21-Apr-26.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
          <ul className="divide-y divide-paper-line">
            {variance.map((t) => (
              <VarianceRow key={t.activity_id} task={t} />
            ))}
          </ul>
          <div className="border-t border-paper-line bg-paper-warm/40 px-4 py-3 text-xs text-ink-mid">
            Johnny submitted site diary at {SITE_DIARY.submitted_at_label} ·{" "}
            {plannedTotal} men deployed across {activeTasks} active tasks ·
            Programme revision 21-Apr-26 ·{" "}
            <a href="#whiteboard" className="text-accent hover:text-accent-deep">
              View diary →
            </a>
          </div>
        </div>
      </div>

      {/* (C) Companies holding things up */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-mid">
          Companies holding things up
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {topRollups.map((r) => (
            <Link
              key={r.company.slug}
              href={`/dashboard/companies/${r.company.slug}`}
              className="block rounded-2xl border border-paper-line bg-paper-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                    style={{ backgroundColor: BRAND[r.company.colour] }}
                  >
                    {r.company.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {r.company.name}
                    </p>
                    <p className="text-[11px] text-ink-mid">{r.company.role}</p>
                  </div>
                </div>
                <p className="font-mono text-sm font-semibold text-red-700">
                  {GBP.format(r.totalPerDay)}/day
                </p>
              </div>
              {r.company.punchLine && (
                <p
                  className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
                  style={{ fontSize: 13 }}
                >
                  {r.company.punchLine}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-mid">
                <span>
                  {r.blockerCount} blocker{r.blockerCount === 1 ? "" : "s"} ·{" "}
                  {r.buCount} affecting BU · oldest {r.oldestWeeks}w
                </span>
                {r.worstRoom && (
                  <span className="rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink">
                    {r.worstRoom}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* (D) Constraint priority by BU impact */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Constraint priority · BU impact
          </h2>
          <button
            type="button"
            onClick={() => onAlertAction?.("tab:constraints")}
            className="text-[11px] font-medium text-accent hover:text-accent-deep"
          >
            View all constraints →
          </button>
        </div>
        <ul className="space-y-2">
          {priority.map((t) => {
            const badge = roomBadge(t.affects_room);
            return (
              <li
                key={t.activity_id}
                className="flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-[11px] text-ink-mid">
                  {t.activity_id}
                </span>
                <span className="flex-1 truncate text-ink">{t.name}</span>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.bg}`}
                  >
                    {badge.label}
                  </span>
                )}
                <span className="font-mono text-[11px] font-semibold text-red-700">
                  {GBP.format(t.cost_per_day)}/day
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* (E) Daily whiteboard / site diary */}
      <div id="whiteboard" className="rounded-2xl border border-paper-line bg-paper-warm/40 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
            Daily whiteboard · {viewingAs.orgName} ({roleLabel(viewingAs.role)})
          </p>
          <p className="text-[11px] text-ink-mid">
            {SITE_DIARY.submitted_by} · {SITE_DIARY.submitted_at_label}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SITE_DIARY.manpower.map((m) => (
            <span
              key={m.activity}
              className="inline-flex items-center gap-2 rounded-full bg-paper-card px-3 py-1 text-xs"
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-paper"
                style={{ backgroundColor: companyColour(m.company) }}
              >
                {m.men}
              </span>
              <span className="text-ink">{m.activity}</span>
              <span className="text-ink-mid">· {companyName(m.company)}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink">{SITE_DIARY.notes}</p>
      </div>

      <p className="text-center text-[11px] text-ink-mid">
        Live computation from the Ardmac DUB-16 baseline · {COMPANIES.length}{" "}
        companies · {MILESTONES.length} milestones tracked
      </p>
    </section>
  );
}

function VarianceRow({ task }: { task: BaselineTask }) {
  const badge = roomBadge(task.affects_room);
  const statusLabel =
    task.status === "blocked" ? "Blocked" : "Not started — should be";
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-accent-deep">
            {task.activity_id}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${task.status === "blocked" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}
          >
            {statusLabel}
          </span>
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.bg}`}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-ink">{task.name}</p>
        {task.blocked_reason && (
          <p className="mt-0.5 text-xs text-ink-mid">{task.blocked_reason}</p>
        )}
        <p className="mt-1 text-[11px] text-ink-mid">
          Responsible:{" "}
          <span style={{ color: companyColour(task.responsible_company) }}>
            {companyName(task.responsible_company)}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        {task.cost_per_day > 0 && (
          <span className="font-mono text-xs font-semibold text-red-700">
            {GBP.format(task.cost_per_day)}/day
          </span>
        )}
        <span className="text-[11px] text-ink-mid">
          {daysOpen(task)}d open
        </span>
        <Link
          href={`/dashboard/tasks/${task.activity_id}`}
          className="rounded-full bg-ink px-3 py-1 text-[10px] font-medium text-paper transition-colors hover:bg-accent"
        >
          Open →
        </Link>
      </div>
    </li>
  );
}
