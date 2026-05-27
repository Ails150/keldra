"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  type Baseline,
  companyBySlug,
  holdingCompany,
  loadBaseline,
  roomByCode,
} from "../../lib/baseline-seed";
import {
  type Activity,
  isUnanswered,
  listActivityForCompany,
  metricsFor,
} from "@/lib/activity";
import { ActivityTimeline } from "../../activity-ui";

type CommFilter = "all" | "outbound" | "inbound" | "needed";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default function CompanyPage() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const router = useRouter();
  const [baseline, setBaseline] = useState<Baseline>(DEFAULT_BASELINE);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<CommFilter>("all");
  useEffect(() => setBaseline(loadBaseline()), []);
  useEffect(() => {
    if (slug) setActivity(listActivityForCompany(slug));
  }, [slug]);

  const commMetrics = metricsFor(activity);
  const shownComm = useMemo(
    () =>
      activity.filter((e) =>
        filter === "all"
          ? true
          : filter === "outbound"
            ? e.direction === "outbound"
            : filter === "inbound"
              ? e.direction === "inbound"
              : isUnanswered(e, activity),
      ),
    [activity, filter],
  );

  const company = companyBySlug(baseline, slug);

  if (!company) {
    return (
      <main className="mx-auto max-w-3xl px-8 py-10">
        <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
          ← Back to dashboard
        </Link>
        <p className="mt-6 text-sm text-ink-mid">Company not found.</p>
      </main>
    );
  }

  const held = baseline.tasks.filter((t) => holdingCompany(t) === slug);
  const owned = baseline.tasks.filter((t) => t.responsible_company === slug);
  const heldCritical = held.filter((t) => t.cost_per_day > 0);
  const totalPerDay = held.reduce((s, t) => s + t.cost_per_day, 0);
  const deployment = baseline.diary.manpower.filter((m) => m.company === slug);

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 space-y-6">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>

      <header className="flex items-center gap-3">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-paper"
          style={{ backgroundColor: BRAND[company.colour] }}
        >
          {company.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 30, lineHeight: 1.1 }}
          >
            {company.name}
          </h1>
          <p className="text-xs text-ink-mid">{company.role}</p>
        </div>
      </header>

      {company.punchLine && (
        <p
          className="font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 14 }}
        >
          {company.punchLine}
        </p>
      )}

      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
          Holding up
        </p>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-red-700"
          style={{ fontSize: 40, lineHeight: 1 }}
        >
          {GBP.format(totalPerDay)}/day
        </p>
      </div>

      <Card title={`Blockers held (${heldCritical.length})`}>
        {heldCritical.length === 0 ? (
          <p className="text-sm text-ink-mid">Nothing currently holding others up.</p>
        ) : (
          <ul className="space-y-2">
            {heldCritical.map((t) => {
              const r = roomByCode(baseline, t.affects_room);
              return (
                <li key={t.activity_id}>
                  <Link
                    href={`/dashboard/tasks/${t.activity_id}`}
                    className="flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-sm transition-colors hover:bg-paper-warm"
                  >
                    <span className="font-mono text-[11px] text-accent-deep">
                      {t.activity_id}
                    </span>
                    <span className="flex-1 truncate text-ink">{t.name}</span>
                    {r && (
                      <span className="rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink-mid">
                        {r.code}
                      </span>
                    )}
                    <span className="font-mono text-[11px] font-semibold text-red-700">
                      {GBP.format(t.cost_per_day)}/day
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`Tasks owned (${owned.length})`}>
        {owned.length === 0 ? (
          <p className="text-sm text-ink-mid">No tasks owned in this baseline.</p>
        ) : (
          <ul className="space-y-1.5">
            {owned.slice(0, 8).map((t) => (
              <li key={t.activity_id} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-[11px] text-ink-mid">
                  {t.activity_id}
                </span>
                <span className="flex-1 truncate text-ink">{t.name}</span>
                <StatusPill status={t.status} />
              </li>
            ))}
            {owned.length > 8 && (
              <li className="text-[11px] text-ink-mid">+ {owned.length - 8} more</li>
            )}
          </ul>
        )}
      </Card>

      <Card title="Today's deployment">
        {deployment.length === 0 ? (
          <p className="text-sm text-ink-mid">
            No men logged for {company.name} in today&apos;s site diary.
          </p>
        ) : (
          deployment.map((m) => (
            <p key={m.activity} className="text-sm text-ink">
              <span className="font-semibold">{m.men}</span>{" "}
              {m.men === 1 ? "man" : "men"} on {m.activity}.
              {heldCritical.length > 0 && (
                <span className="text-ink-mid">
                  {" "}
                  Meeting deployment, but holding {heldCritical.length} critical
                  task{heldCritical.length === 1 ? "" : "s"}.
                </span>
              )}
            </p>
          ))
        )}
      </Card>

      {/* Communication history */}
      <section className="rounded-xl" style={{ border: `0.5px solid ${BRAND.border}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `0.5px solid ${BRAND.border}` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-fraunces)] text-ink" style={{ fontSize: 18 }}>
              Communication history
            </h2>
            <p className="font-mono text-[12px] text-ink-mid">
              {activity.length} entries · {commMetrics.outbound_count} chases ·{" "}
              {commMetrics.inbound_count} responses · response rate{" "}
              {commMetrics.response_rate}%
            </p>
          </div>
          <p className="mt-1 text-[13px] italic text-ink-mid">
            Every interaction logged across all tasks where {company.name} is held
            by or recipient.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["outbound", "Outbound only"],
                ["inbound", "Inbound only"],
                ["needed", "Responses needed"],
              ] as [CommFilter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={
                  filter === id
                    ? { backgroundColor: BRAND.ink, color: BRAND.cream }
                    : { border: `0.5px solid ${BRAND.border}`, color: BRAND.inkMuted }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ActivityTimeline
          entries={shownComm}
          taskLabel={(id) => {
            const t = baseline.tasks.find((x) => x.activity_id === id);
            return t ? `${id} · ${t.name.slice(0, 24)}${t.name.length > 24 ? "…" : ""}` : id;
          }}
          onTaskClick={(id) => router.push(`/dashboard/tasks/${id}`)}
        />
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-paper-line bg-paper-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-mid">
        {title}
      </p>
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: "bg-green-100 text-green-800",
    on_track: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-700",
    not_started_should_be: "bg-amber-100 text-amber-800",
  };
  const label =
    status === "not_started_should_be"
      ? "Not started"
      : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? "bg-paper-warm text-ink-mid"}`}
    >
      {label}
    </span>
  );
}
