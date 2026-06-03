"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  type Baseline,
  type BaselineTask,
  companyColour,
  companyName,
  loadBaseline,
  roomByCode,
} from "../lib/baseline-seed";
import { listActivityForTask } from "@/lib/activity";

type Filter = "all" | "critical" | "bu" | "stuck" | "ontrack";
type DisplayStatus =
  | "blocked"
  | "not_started"
  | "understaffed"
  | "on_track"
  | "complete";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical room only" },
  { id: "bu", label: "BU only" },
  { id: "stuck", label: "Stuck only" },
  { id: "ontrack", label: "On track only" },
];

const DAY_MS = 86_400_000;

// Understaffed is derived: an on-track task with fewer men on the deck than the
// programme planned. Everything else maps straight from the stored status.
function displayStatus(t: BaselineTask): DisplayStatus {
  if (t.status === "complete") return "complete";
  if (t.status === "blocked") return "blocked";
  if (t.status === "not_started_should_be") return "not_started";
  return (t.actual_manpower ?? 0) < t.planned_manpower ? "understaffed" : "on_track";
}

const SEVERITY: Record<DisplayStatus, number> = {
  blocked: 4,
  not_started: 3,
  understaffed: 2,
  on_track: 1,
  complete: 0,
};

const PILL: Record<DisplayStatus, { bg: string; ink: string; label: string }> = {
  blocked: { bg: BRAND.dangerBg, ink: BRAND.dangerInk, label: "Blocked" },
  not_started: { bg: BRAND.warningBg, ink: BRAND.warningInk, label: "Not started" },
  understaffed: { bg: BRAND.cxPreEnergy, ink: BRAND.purpleDeep, label: "Understaffed" },
  on_track: { bg: BRAND.successBg, ink: BRAND.successInk, label: "On track" },
  complete: { bg: BRAND.successBg, ink: BRAND.successInk, label: "Complete" },
};

function midnight(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// "21-Apr-26" from an ISO revision date.
function revLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")}-${m[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

export default function PlannedVsActualView() {
  const router = useRouter();
  const [baseline, setBaseline] = useState<Baseline>(DEFAULT_BASELINE);
  const [recent24h, setRecent24h] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const b = loadBaseline();
    setBaseline(b);
    const now = Date.now();
    setDateLabel(
      new Date(now).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
    // Tasks with a status flip in the last 24h count as "active today" even if
    // no men are reported.
    const s = new Set<string>();
    for (const t of b.tasks) {
      const hit = listActivityForTask(t.activity_id).some((e) => {
        const age = now - new Date(e.created_at).getTime();
        return e.type === "status_change" && age >= 0 && age <= DAY_MS;
      });
      if (hit) s.add(t.activity_id);
    }
    setRecent24h(s);
  }, []);

  // Programme says this should be underway by now and it isn't finished. The
  // MER seed is behind, so most planned-active tasks are overdue — which is
  // exactly the variance this view exists to show.
  const plannedActive = useMemo(() => {
    const today = midnight(new Date());
    return baseline.tasks.filter(
      (t) => midnight(new Date(t.planned_start)) <= today && t.status !== "complete",
    );
  }, [baseline.tasks]);

  const summary = useMemo(() => {
    const plannedMen = plannedActive.reduce((s, t) => s + t.planned_manpower, 0);
    const actualMen = plannedActive.reduce((s, t) => s + (t.actual_manpower ?? 0), 0);
    const actualActive = plannedActive.filter(
      (t) => (t.actual_manpower ?? 0) > 0 || recent24h.has(t.activity_id),
    ).length;
    const variance = plannedMen === 0 ? null : Math.round((100 * (plannedMen - actualMen)) / plannedMen);
    return {
      plannedCount: plannedActive.length,
      actualActive,
      plannedMen,
      actualMen,
      variance,
    };
  }, [plannedActive, recent24h]);

  const rows = useMemo(() => {
    const passes = (t: BaselineTask): boolean => {
      const room = roomByCode(baseline, t.affects_room);
      const ds = displayStatus(t);
      switch (filter) {
        case "critical":
          return !!room;
        case "bu":
          return room?.tag === "BU";
        case "stuck":
          return ds === "blocked" || ds === "understaffed" || ds === "not_started";
        case "ontrack":
          return ds === "on_track";
        default:
          return true;
      }
    };
    return plannedActive
      .filter(passes)
      .map((t) => ({ t, delta: (t.actual_manpower ?? 0) - t.planned_manpower, ds: displayStatus(t) }))
      .sort((a, b) => {
        const d = Math.abs(b.delta) - Math.abs(a.delta);
        if (d !== 0) return d;
        return SEVERITY[b.ds] - SEVERITY[a.ds];
      });
  }, [plannedActive, filter, baseline]);

  const varianceColour =
    summary.variance === null
      ? BRAND.cream
      : summary.variance > 25
        ? BRAND.dangerInk
        : summary.variance >= 10
          ? BRAND.warningInk
          : BRAND.successInk;

  return (
    <section className="mx-auto max-w-5xl px-8 space-y-4">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold"
          style={{ fontSize: 28, lineHeight: 1.1, color: BRAND.ink }}
        >
          Planned vs Actual
        </h1>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] italic"
          style={{ fontSize: 14, color: BRAND.inkMuted }}
        >
          MER · {dateLabel || "…"} · Programme rev{" "}
          {revLabel(baseline.project.baseline_revision_date)}
        </p>
      </header>

      {/* Block A — summary strip */}
      <div
        className="flex items-stretch"
        style={{ backgroundColor: BRAND.ink, color: BRAND.cream, borderRadius: 12, padding: "18px 24px" }}
      >
        <SummaryCol
          eyebrow="Activities today"
          big={`${summary.actualActive} of ${summary.plannedCount}`}
          sub="Tasks that had work logged today vs tasks the programme says should be active"
        />
        <Divider />
        <SummaryCol
          eyebrow="Manpower today"
          big={`${summary.actualMen} of ${summary.plannedMen} men`}
          sub="Reported deployed vs planned across active tasks"
        />
        <Divider />
        <SummaryCol
          eyebrow="Variance"
          big={summary.variance === null ? "—" : `${summary.variance}%`}
          bigColour={varianceColour}
          sub="Behind plan today"
        />
      </div>

      {/* Impact timeline — ctelecoms-subts the variance to the BU date */}
      <ImpactTimeline variance={summary.variance} />

      {/* Block B — filter chips */}
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 16 }}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                fontSize: 11,
                padding: "4px 12px",
                borderRadius: 4,
                backgroundColor: on ? BRAND.ink : BRAND.cream,
                color: on ? BRAND.cream : BRAND.inkMuted,
                border: on ? "0.5px solid transparent" : `0.5px solid ${BRAND.border}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Block C — variance table */}
      <div
        className="overflow-hidden"
        style={{ marginTop: 12, border: `0.5px solid ${BRAND.border}`, borderRadius: 12 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Activity ID", "Task", "Responsible", "Planned", "Actual", "Status", "Delta"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className="sticky top-0 font-mono"
                      style={{
                        backgroundColor: BRAND.cream,
                        color: BRAND.inkMuted,
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        padding: "12px 16px",
                        textAlign: i >= 3 && i <= 4 ? "right" : i === 6 ? "right" : "left",
                        borderBottom: `0.5px solid ${BRAND.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, delta, ds }, idx) => {
                const pill = PILL[ds];
                const actual = t.actual_manpower ?? 0;
                const actualColour = actual >= t.planned_manpower ? BRAND.successInk : BRAND.dangerInk;
                const deltaColour =
                  delta < 0 ? BRAND.dangerInk : delta > 0 ? BRAND.successInk : BRAND.inkMuted;
                const deltaText = `${delta < 0 ? "−" : delta > 0 ? "+" : ""}${Math.abs(delta)}`;
                const last = idx === rows.length - 1;
                return (
                  <tr
                    key={t.activity_id}
                    onClick={() => router.push(`/dashboard/tasks/${t.activity_id}`)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: last ? "none" : `0.5px solid ${BRAND.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.cream)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <td className="font-mono" style={cell({ fontSize: 11, color: BRAND.ink })}>
                      {t.activity_id}
                    </td>
                    <td style={cell({ fontSize: 13, fontWeight: 500, color: BRAND.ink, maxWidth: 280 })}>
                      <span className="block truncate">{t.name}</span>
                    </td>
                    <td style={cell({})}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-flex items-center justify-center rounded-full font-bold"
                          style={{
                            width: 18,
                            height: 18,
                            fontSize: 8,
                            backgroundColor: companyColour(baseline, t.responsible_company),
                            color: BRAND.cream,
                          }}
                        >
                          {companyName(baseline, t.responsible_company).slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: BRAND.ink }}>
                          {companyName(baseline, t.responsible_company)}
                        </span>
                      </span>
                    </td>
                    <td
                      className="font-mono"
                      style={cell({ fontSize: 13, color: BRAND.ink, textAlign: "right" })}
                    >
                      {t.planned_manpower}
                    </td>
                    <td
                      className="font-mono"
                      style={cell({ fontSize: 13, color: actualColour, textAlign: "right" })}
                    >
                      {actual}
                    </td>
                    <td style={cell({})}>
                      <span
                        className="rounded-full font-semibold"
                        style={{
                          backgroundColor: pill.bg,
                          color: pill.ink,
                          fontSize: 10,
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td
                      className="font-mono"
                      style={cell({ fontSize: 13, color: deltaColour, textAlign: "right", fontWeight: 600 })}
                    >
                      {deltaText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          style={{
            backgroundColor: BRAND.cream,
            borderTop: `0.5px solid ${BRAND.border}`,
            color: BRAND.inkMuted,
            fontSize: 11,
            padding: "12px 16px",
          }}
        >
          {rows.length} task{rows.length === 1 ? "" : "s"} shown ·{" "}
          {summary.plannedCount - rows.length} filtered out · last site diary submitted at{" "}
          {baseline.diary.submitted_at_label}
        </div>
      </div>
    </section>
  );
}

function cell(extra: React.CSSProperties): React.CSSProperties {
  return { padding: "12px 16px", verticalAlign: "middle", ...extra };
}

function Divider() {
  return (
    <div
      className="mx-5 self-stretch"
      style={{ width: "0.5px", backgroundColor: BRAND.cream, opacity: 0.2 }}
    />
  );
}

// Pilot wires real velocity math — the slip, forecast date and per-day
// multiplier are hardcoded for the demo.
const IMPACT_TODAY = new Date(2026, 4, 28); // 28 May
const IMPACT_PLANNED_BU = new Date(2026, 11, 2); // 02 Dec
const IMPACT_FORECAST_BU = new Date(2026, 11, 20); // 20 Dec
const IMPACT_SLIP_DAYS = 18;
const IMPACT_DAY_MULTIPLIER = 0.3;

function ImpactTimeline({ variance }: { variance: number | null }) {
  const span = IMPACT_FORECAST_BU.getTime() - IMPACT_TODAY.getTime();
  const plannedPct =
    ((IMPACT_PLANNED_BU.getTime() - IMPACT_TODAY.getTime()) / span) * 100;
  const v = variance ?? 24;

  return (
    <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "18px 24px" }}>
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.purple,
          fontWeight: 600,
        }}
      >
        What today&apos;s shortfall does to the date
      </p>

      {/* End-point labels */}
      <div className="relative" style={{ marginTop: 18, height: 16 }}>
        <span style={{ position: "absolute", left: 0, fontSize: 11, color: BRAND.inkMuted }}>
          Today · 28 May
        </span>
        <span
          style={{
            position: "absolute",
            right: 0,
            fontSize: 11,
            fontWeight: 600,
            color: BRAND.dangerInk,
          }}
        >
          Forecast BU · 20 Dec · +{IMPACT_SLIP_DAYS} days
        </span>
      </div>

      {/* Track: green to planned BU, red slip beyond it */}
      <div className="relative" style={{ height: 12, marginTop: 6 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            backgroundColor: BRAND.cream,
            border: `0.5px solid ${BRAND.border}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${plannedPct}%`,
            borderRadius: "999px 0 0 999px",
            backgroundColor: BRAND.successInk,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${plannedPct}%`,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: "0 999px 999px 0",
            backgroundColor: BRAND.dangerInk,
          }}
        />
        {/* Planned BU marker — green tick */}
        <div
          style={{
            position: "absolute",
            left: `${plannedPct}%`,
            top: -3,
            bottom: -3,
            width: 2,
            backgroundColor: BRAND.successInk,
            transform: "translateX(-1px)",
          }}
        />
        {/* Forecast BU marker — red dot at the right edge */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            width: 12,
            height: 12,
            borderRadius: 999,
            backgroundColor: BRAND.dangerInk,
            border: `2px solid ${BRAND.cream}`,
            transform: "translate(50%, -50%)",
          }}
        />
      </div>

      {/* Planned BU caption under its marker */}
      <div className="relative" style={{ height: 16, marginTop: 6 }}>
        <span
          style={{
            position: "absolute",
            left: `${plannedPct}%`,
            transform: "translateX(-50%)",
            fontSize: 11,
            fontWeight: 600,
            color: BRAND.successInk,
            whiteSpace: "nowrap",
          }}
        >
          ✓ Planned BU · 02 Dec
        </span>
      </div>

      <p style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5, color: BRAND.ink }}>
        At <span style={{ fontWeight: 600 }}>{v}% behind plan</span> sustained, MER
        forecasts <span style={{ fontWeight: 600, color: BRAND.dangerInk }}>+{IMPACT_SLIP_DAYS} working days</span>.
        Each day at this manpower level adds ~{IMPACT_DAY_MULTIPLIER} days to the programme.
      </p>
    </div>
  );
}

function SummaryCol({
  eyebrow,
  big,
  bigColour,
  sub,
}: {
  eyebrow: string;
  big: string;
  bigColour?: string;
  sub: string;
}) {
  return (
    <div className="flex-1">
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.cream,
          opacity: 0.7,
        }}
      >
        {eyebrow}
      </p>
      <p
        className="font-[family-name:var(--font-fraunces)] font-semibold"
        style={{ fontSize: 28, lineHeight: 1.15, marginTop: 4, color: bigColour ?? BRAND.cream }}
      >
        {big}
      </p>
      <p style={{ fontSize: 11, marginTop: 4, color: BRAND.cream, opacity: 0.7 }}>{sub}</p>
    </div>
  );
}
