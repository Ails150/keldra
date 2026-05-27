"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  type Baseline,
  companyColour,
  companyName,
  daysOpen,
  roomByCode,
  loadBaseline,
  taskById,
} from "../../lib/baseline-seed";
import {
  type Activity,
  type SilenceMetrics,
  buildSynopsis,
  listActivityForTask,
  metricsFor,
} from "@/lib/activity";
import { ActivityTimeline, LogActivityModal, Toast } from "../../activity-ui";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TaskPage() {
  const params = useParams();
  const activityId = decodeURIComponent(String(params.activity_id ?? ""));
  const [baseline, setBaseline] = useState<Baseline>(DEFAULT_BASELINE);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [metrics, setMetrics] = useState<SilenceMetrics | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setBaseline(loadBaseline()), []);
  useEffect(() => {
    const e = listActivityForTask(activityId);
    setActivity(e);
    setMetrics(metricsFor(e));
  }, [activityId]);

  function refresh() {
    const e = listActivityForTask(activityId);
    setActivity(e);
    setMetrics(metricsFor(e));
  }
  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  const task = taskById(baseline, activityId);

  if (!task) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-10">
        <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
          ← Back to dashboard
        </Link>
        <p className="mt-6 text-sm text-ink-mid">
          Task <span className="font-mono">{activityId}</span> not found in the
          current baseline.
        </p>
      </main>
    );
  }

  const room = roomByCode(baseline, task.affects_room);
  const statusLabel =
    task.status === "not_started_should_be"
      ? "Not started — should be running"
      : task.status.charAt(0).toUpperCase() + task.status.slice(1);

  const synopsis = buildSynopsis(task, activity, baseline);

  const silence =
    metrics && metrics.outbound_count > 0 && metrics.days_since_last_outbound > 14
      ? `⚠ No outbound activity in ${metrics.days_since_last_outbound} days`
      : metrics && metrics.outbound_count > 0 && metrics.response_rate < 30
        ? `⚠ Response rate: ${metrics.response_rate}% · ${metrics.inbound_count} of ${metrics.outbound_count} chases got a reply`
        : null;

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left — task detail */}
        <div className="space-y-6">
          <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
            ← Back to dashboard
          </Link>

          <header>
            <p className="font-mono text-sm text-accent-deep">{task.activity_id}</p>
            <h1
              className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 28, lineHeight: 1.15 }}
            >
              {task.name}
            </h1>
            <p className="mt-1 text-xs text-ink-mid">{task.wbs_path}</p>
          </header>

          {task.blocked_reason && (
            <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Why</p>
              <p className="mt-1 text-sm text-ink">{task.blocked_reason}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" value={statusLabel} />
            <Field
              label="Cost of delay"
              value={task.cost_per_day > 0 ? `${GBP.format(task.cost_per_day)}/day` : "—"}
              danger={task.cost_per_day > 0}
            />
            <Field label="Planned start" value={fmt(task.planned_start)} />
            <Field label="Planned end" value={fmt(task.planned_end)} />
            <Field label="Manpower" value={`${task.actual_manpower} of ${task.planned_manpower} planned`} />
            <Field label="Days open" value={`${daysOpen(task)}d`} />
          </div>

          <div className="rounded-2xl border border-paper-line bg-paper-card p-5 space-y-3">
            <Row label="Responsible">
              <CompanyChip baseline={baseline} slug={task.responsible_company} />
            </Row>
            {task.blocking_company && (
              <Row label="Held by">
                <CompanyChip baseline={baseline} slug={task.blocking_company} />
              </Row>
            )}
            {room && (
              <Row label="Affects room">
                <span className="text-sm font-medium text-ink">
                  {room.code} · {room.name}{" "}
                  <span className="text-ink-mid">(target {room.target})</span>
                </span>
              </Row>
            )}
          </div>
        </div>

        {/* Right — activity trail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl" style={{ border: `0.5px solid ${BRAND.border}` }}>
            <div className="px-5 py-4" style={{ borderBottom: `0.5px solid ${BRAND.border}` }}>
              <div className="flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-fraunces)] text-ink" style={{ fontSize: 16 }}>
                  Activity trail
                </h2>
                <button
                  type="button"
                  onClick={() => setLogOpen(true)}
                  className="rounded text-xs font-medium text-paper"
                  style={{ backgroundColor: BRAND.purple, padding: "6px 12px" }}
                >
                  + Log activity
                </button>
              </div>
              {metrics && (
                <p className="mt-2 font-mono text-[12px] text-ink-mid">
                  {activity.length} entries · {metrics.outbound_count} outbound ·{" "}
                  {metrics.inbound_count} responses ·{" "}
                  {metrics.days_since_any === Infinity ? "—" : `last ${metrics.days_since_any}d ago`}
                </p>
              )}
              {silence && (
                <p
                  className="mt-2 inline-block rounded px-2 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: BRAND.warningBg, color: BRAND.warningInk }}
                >
                  {silence}
                </p>
              )}
            </div>

            {synopsis.length > 0 && (
              <div style={{ padding: "12px 20px", borderBottom: `0.5px solid ${BRAND.border}` }}>
                <p
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: BRAND.inkMuted,
                    fontWeight: 600,
                  }}
                >
                  Synopsis
                </p>
                <div className="mt-1">
                  {synopsis.map((r, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline"
                      style={{ gap: 8, padding: "4px 0" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink }}>
                        {r.bold}
                      </span>
                      <span
                        style={{ fontSize: 12, color: BRAND.inkMuted, flex: "1 1 0%", minWidth: 0 }}
                      >
                        {r.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
              <ActivityTimeline entries={activity} />
            </div>

            <div className="px-5 py-3.5 text-center" style={{ borderTop: `0.5px solid ${BRAND.border}` }}>
              <button
                type="button"
                onClick={() => showToast("Export — coming in pilot")}
                className="text-[11px] text-ink-mid hover:text-ink"
              >
                Export trail as PDF
              </button>
            </div>
          </div>
        </aside>
      </div>

      {logOpen && (
        <LogActivityModal
          taskId={task.activity_id}
          taskName={task.name}
          currentStatus={task.status}
          currentCost={task.cost_per_day}
          onClose={() => setLogOpen(false)}
          onLogged={() => {
            refresh();
            showToast("Activity logged · timeline updated");
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </main>
  );
}

function Field({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">{label}</p>
      <p className={`mt-1 text-sm font-medium ${danger ? "text-red-700" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-mid">{label}</span>
      {children}
    </div>
  );
}

function CompanyChip({ baseline, slug }: { baseline: Baseline; slug: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-paper"
        style={{ backgroundColor: companyColour(baseline, slug) }}
      >
        {companyName(baseline, slug).slice(0, 2).toUpperCase()}
      </span>
      <span className="text-sm font-medium text-ink">{companyName(baseline, slug)}</span>
    </span>
  );
}
