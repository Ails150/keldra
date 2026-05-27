"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { roleLabel } from "../utils";
import { BRAND } from "@/lib/brand";
import {
  BU_TARGET,
  MILESTONES,
  type Baseline,
  type BaselineTask,
  affectsBu,
  companyColour,
  companyName,
  companyRollups,
  daysOpen,
  loadBaseline,
  roomByCode,
  varianceTasks,
  workingDaysUntil,
} from "../lib/baseline-seed";
import { listSilentTasks, type SilentTask } from "@/lib/activity";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function roomBadge(
  b: Baseline,
  code: string | null,
): { label: string; bg: string } | null {
  const r = roomByCode(b, code);
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

// Whole weeks from today to an ISO milestone date.
function weeksUntil(iso: string): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(iso);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (7 * 86400000));
}

export default function TodayView({
  project: _project,
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
  const [baseline] = useState<Baseline>(() => loadBaseline());
  const [silent] = useState<SilentTask[]>(() => listSilentTasks());
  const [dirDate] = useState(() => {
    const d = new Date();
    const wd = d.toLocaleDateString("en-GB", { weekday: "long" });
    const mon = d.toLocaleDateString("en-GB", { month: "short" });
    return `${wd} ${String(d.getDate()).padStart(2, "0")} ${mon}`.toUpperCase();
  });
  const router = useRouter();

  const variance = varianceTasks(baseline);
  const rollups = companyRollups(baseline).slice(0, 6);
  const buDays = workingDaysUntil(BU_TARGET);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const plannedTotal = baseline.diary.manpower.reduce((s, m) => s + m.men, 0);
  const activeTasks = baseline.tasks.filter(
    (t) => t.status === "blocked" || t.status === "on_track",
  ).length;

  const priority = baseline.tasks
    .filter((t) => affectsBu(baseline, t) && t.cost_per_day > 0)
    .sort((a, b) => b.cost_per_day - a.cost_per_day)
    .slice(0, 5);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-7">
      {/* Director forecast — milestone look-ahead. Pilot week 1 wires real
          trajectory math here; numbers are hardcoded for the demo. */}
      <div
        className="bg-white"
        style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: -12 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: BRAND.inkMuted,
              fontWeight: 600,
            }}
          >
            Director forecast · Looking ahead from {dirDate}
          </p>
          <p
            className="font-[family-name:var(--font-fraunces)] italic"
            style={{ fontSize: 11, color: BRAND.inkMuted }}
          >
            Computed live from baseline · DUB-16 P6 rev 21-Apr-26
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ForecastTile
            eyebrow="At site install"
            dateLine={`17 Aug 26 · ${weeksUntil("2026-08-17")} weeks away`}
            dot={BRAND.warningInk}
            headline="12 weeks behind ready"
            headlineColour={BRAND.ink}
            detail="8 off-site assets need to clear L2/L3 first"
            action="→ Action this week"
            actionColour={BRAND.warningInk}
            onClick={() => scrollTo("variance-card")}
          />
          <ForecastTile
            eyebrow="At yellow tag"
            dateLine={`04 Nov 26 · ${weeksUntil("2026-11-04")} weeks away`}
            dot={BRAND.warningInk}
            headline="8 weeks behind ready"
            headlineColour={BRAND.ink}
            detail="5 blockers must clear by 18 Sep to stay critical path"
            action="→ Action this month"
            actionColour={BRAND.warningInk}
            onClick={() => scrollTo("companies-holding")}
          />
          <ForecastTile
            eyebrow="At BU"
            dateLine={`02 Dec 26 · ${weeksUntil("2026-12-02")} weeks away`}
            dot={BRAND.dangerInk}
            headline="At risk · £4.2m exposure"
            headlineColour={BRAND.dangerInk}
            detail="5 of 7 chains terminate at Microsoft. Without sign-offs, slip is real"
            action="→ The Microsoft ask"
            actionColour={BRAND.dangerInk}
            onClick={() => router.push("/dashboard/holding-back")}
          />
        </div>
      </div>

      {/* (A) BU countdown strip */}
      <div
        id="bu-countdown"
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
                style={{ color: BRAND.cream, border: `1px solid ${BRAND.purple}` }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* (B) Baseline variance card */}
      <div id="variance-card">
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
          Programme: {baseline.project.name}, revision{" "}
          {baseline.project.baseline_revision_date}.
        </p>

        {variance.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-paper-line bg-paper-card p-8 text-center text-sm text-ink-mid">
            No variance in the current baseline. Drop a programme on{" "}
            <Link href="/dashboard/ingest" className="text-accent">
              ingest
            </Link>{" "}
            to populate.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
            <ul className="divide-y divide-paper-line">
              {variance.slice(0, 12).map((t) => (
                <VarianceRow key={t.activity_id} baseline={baseline} task={t} />
              ))}
            </ul>
            <div className="border-t border-paper-line bg-paper-warm/40 px-4 py-3 text-xs text-ink-mid">
              {baseline.diary.submitted_by} submitted site diary at{" "}
              {baseline.diary.submitted_at_label} · {plannedTotal} men across{" "}
              {activeTasks} active tasks · revision{" "}
              {baseline.project.baseline_revision_date} ·{" "}
              <a href="#whiteboard" className="text-accent hover:text-accent-deep">
                View diary →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* (C) Companies holding things up */}
      {rollups.length > 0 && (
        <div id="companies-holding">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Companies holding things up
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rollups.map((r) => (
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
      )}

      {/* Silence report — blocked tasks losing money with no recent chase */}
      <div className="rounded-xl" style={{ border: `0.5px solid ${BRAND.border}`, padding: "18px 20px" }}>
        <div className="flex items-center justify-between gap-3">
          <h2
            className="font-[family-name:var(--font-fraunces)] text-ink"
            style={{ fontSize: 15 }}
          >
            Silence report
          </h2>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[11px]"
            style={{ backgroundColor: BRAND.dangerBg, color: BRAND.dangerInk }}
          >
            {silent.length} task{silent.length === 1 ? "" : "s"} · £
            {Math.round(silent.reduce((s, t) => s + t.cost_per_day, 0) / 1000)}k/day
          </span>
        </div>
        <p className="mt-1 text-[12px] italic text-ink-mid">
          Blocked tasks losing money with no chase logged in 14+ days.
        </p>
        {silent.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-mid">
            No silent tasks — every blocked item has a recent chase logged.
          </p>
        ) : (
          <ul className="mt-2">
            {silent.slice(0, 5).map((t) => (
              <li key={t.activity_id} style={{ borderBottom: `0.5px solid ${BRAND.border}` }}>
                <Link
                  href={`/dashboard/tasks/${t.activity_id}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-ink-mid">{t.activity_id}</p>
                    <p className="truncate text-[13px] font-medium text-ink">{t.name}</p>
                    <p className="text-[11px] text-ink-mid">
                      Held by {companyName(baseline, t.held_by)} · {t.days_silent}d silent
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p
                      className="font-[family-name:var(--font-fraunces)]"
                      style={{ fontSize: 16, color: BRAND.dangerInk }}
                    >
                      £{Math.round(t.cost_per_day / 1000)}k/day
                    </p>
                    <p className="text-[10px] text-ink-mid">{t.days_open}d open</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-mid">View all silent tasks →</p>
      </div>

      {/* (D) Constraint priority by BU impact */}
      {priority.length > 0 && (
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
              const badge = roomBadge(baseline, t.affects_room);
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
      )}

      {/* (E) Daily whiteboard / site diary */}
      <div
        id="whiteboard"
        className="rounded-2xl border border-paper-line bg-paper-warm/40 p-5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
            Daily whiteboard · {viewingAs.orgName} ({roleLabel(viewingAs.role)})
          </p>
          <p className="text-[11px] text-ink-mid">
            {baseline.diary.submitted_by} · {baseline.diary.submitted_at_label}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {baseline.diary.manpower.map((m) => (
            <span
              key={`${m.activity}-${m.company}`}
              className="inline-flex items-center gap-2 rounded-full bg-paper-card px-3 py-1 text-xs"
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-paper"
                style={{ backgroundColor: companyColour(baseline, m.company) }}
              >
                {m.men}
              </span>
              <span className="text-ink">{m.activity}</span>
              <span className="text-ink-mid">
                · {companyName(baseline, m.company)}
              </span>
            </span>
          ))}
        </div>
        {baseline.diary.notes && (
          <p className="mt-3 text-xs leading-relaxed text-ink">
            {baseline.diary.notes}
          </p>
        )}
      </div>

      <p className="text-center text-[11px] text-ink-mid">
        Live computation from the {baseline.project.name} baseline ·{" "}
        {baseline.companies.length} companies · {MILESTONES.length} milestones
        tracked
      </p>
    </section>
  );
}

function ForecastTile({
  eyebrow,
  dateLine,
  dot,
  headline,
  headlineColour,
  detail,
  action,
  actionColour,
  onClick,
}: {
  eyebrow: string;
  dateLine: string;
  dot: string;
  headline: string;
  headlineColour: string;
  detail: string;
  action: string;
  actionColour: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg transition-colors duration-200"
      style={{ padding: "10px 12px", backgroundColor: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.cream)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.inkMuted,
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </p>
      <p className="mt-1.5" style={{ fontSize: 12, color: BRAND.ink }}>
        {dateLine}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: dot, flexShrink: 0 }}
        />
        <span
          className="font-[family-name:var(--font-fraunces)] font-semibold"
          style={{ fontSize: 18, lineHeight: 1.1, color: headlineColour }}
        >
          {headline}
        </span>
      </div>
      <p className="mt-1.5" style={{ fontSize: 11, color: BRAND.inkMuted }}>
        {detail}
      </p>
      <p className="mt-1.5" style={{ fontSize: 11, color: actionColour, fontWeight: 500 }}>
        {action}
      </p>
    </div>
  );
}

function VarianceRow({
  baseline,
  task,
}: {
  baseline: Baseline;
  task: BaselineTask;
}) {
  const badge = roomBadge(baseline, task.affects_room);
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
          <span style={{ color: companyColour(baseline, task.responsible_company) }}>
            {companyName(baseline, task.responsible_company)}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
        {task.cost_per_day > 0 && (
          <span className="font-mono text-xs font-semibold text-red-700">
            {GBP.format(task.cost_per_day)}/day
          </span>
        )}
        <span className="text-[11px] text-ink-mid">{daysOpen(task)}d open</span>
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
