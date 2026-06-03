"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  type Baseline,
  type CriticalRoom,
  companyBySlug,
  daysOpen,
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

const DAY_MS = 86400000;
const ROOM_RANK: Record<string, number> = { BU: 4, MMR1: 3, MMR2: 3, Earth: 2, Security: 1 };
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
// Soonest future occurrence of the given weekday (0=Sun … 5=Fri).
function upcomingWeekday(target: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const add = ((target - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d;
}
function fmtWD(d: Date): string {
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
function verbFor(activityId: string, role: string): string {
  if (activityId.startsWith("PRO")) return "Deliver";
  if (role === "Design") return "Sign-off";
  if (role === "Subcontractor") return "Install";
  return "Action";
}
function downstreamFor(room: CriticalRoom | undefined): string {
  if (!room) return "Downstream BU milestones slip without it.";
  return room.tag === "BU"
    ? `${room.code} can't reach beneficial use without it.`
    : `${room.code} first-fix can't start without it.`;
}

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

  // ----- Performance metrics (computed from the activity trail) -----
  const chases = activity.filter(
    (e) => e.type === "chase" && e.direction === "outbound" && e.recipient?.company_slug === slug,
  );
  const responses = activity.filter(
    (e) => e.type === "response" && e.direction === "inbound" && e.actor.company_slug === slug,
  );
  const respRate = chases.length ? Math.round((100 * responses.length) / chases.length) : null;

  const inboundTimes = activity
    .filter((e) => e.direction === "inbound" && e.actor.company_slug === slug)
    .map((e) => new Date(e.created_at).getTime())
    .sort((a, b) => a - b);
  const deltas: number[] = [];
  for (const c of chases) {
    const ct = new Date(c.created_at).getTime();
    const next = inboundTimes.find((t) => t > ct);
    if (next != null) deltas.push((next - ct) / DAY_MS);
  }
  const avgDays = deltas.length
    ? Math.round(deltas.reduce((s, x) => s + x, 0) / deltas.length)
    : null;

  const openCount = held.length;
  const oldestWeeks = Math.floor(held.reduce((m, t) => Math.max(m, daysOpen(t)), 0) / 7);

  let worstRoom: CriticalRoom | undefined;
  for (const t of held) {
    const r = roomByCode(baseline, t.affects_room);
    if (!r) continue;
    if (!worstRoom || (ROOM_RANK[r.tag] ?? 0) > (ROOM_RANK[worstRoom.tag] ?? 0)) worstRoom = r;
  }
  const affectsBuRoom = worstRoom?.tag === "BU";

  const rateColour =
    respRate === null
      ? BRAND.inkMuted
      : respRate < 30
        ? BRAND.dangerInk
        : respRate <= 70
          ? BRAND.warningInk
          : BRAND.successInk;
  const avgColour =
    avgDays === null
      ? BRAND.inkMuted
      : avgDays > 5
        ? BRAND.dangerInk
        : avgDays > 2
          ? BRAND.warningInk
          : BRAND.successInk;

  // ----- "What we need" actions (top 3 blockers by cost) -----
  const actions = held
    .slice()
    .sort((a, b) => b.cost_per_day - a.cost_per_day)
    .slice(0, 3)
    .map((t) => ({
      id: t.activity_id,
      title: truncate(t.name, 30),
      consequence: `${verbFor(t.activity_id, company.role)} by ${fmtWD(
        t.cost_per_day > 10000 ? upcomingWeekday(5) : upcomingWeekday(1),
      )}. ${downstreamFor(roomByCode(baseline, t.affects_room))}`,
    }));

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

      {/* Performance metrics strip */}
      <section
        className="bg-white"
        style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "18px 20px" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="font-[family-name:var(--font-fraunces)]"
            style={{ fontSize: 16, color: BRAND.ink }}
          >
            Performance — {company.name}
          </h2>
          <p
            className="font-[family-name:var(--font-fraunces)] italic"
            style={{ fontSize: 11, color: BRAND.inkMuted }}
          >
            Computed from activity trail across MER
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <PerfCol
            eyebrow="Response rate"
            value={respRate === null ? "—" : `${respRate}%`}
            valueColour={rateColour}
            sub={
              chases.length === 0
                ? "No chases logged yet"
                : `${responses.length} of ${chases.length} chases got a reply`
            }
            divider={false}
          />
          <PerfCol
            eyebrow="Avg response time"
            value={avgDays === null ? "—" : `${avgDays}d`}
            valueColour={avgColour}
            sub="vs. 2d expected per spec"
            divider
          />
          <PerfCol
            eyebrow={`Open with ${company.name}`}
            value={`${openCount}`}
            valueColour={BRAND.ink}
            sub={
              openCount === 0
                ? "Nothing currently open"
                : `${openCount} item${openCount === 1 ? "" : "s"} · oldest ${oldestWeeks}w`
            }
            divider
          />
          <PerfCol
            eyebrow="BU impact"
            value={worstRoom ? worstRoom.code : "—"}
            valueColour={
              worstRoom ? (affectsBuRoom ? BRAND.dangerInk : BRAND.warningInk) : BRAND.inkMuted
            }
            sub={
              worstRoom
                ? `target ${worstRoom.target} · ${affectsBuRoom ? "directly at BU" : "feeds BU"}`
                : "No critical room mapped"
            }
            divider
          />
        </div>
      </section>

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

      {/* What we need — screen-share ask, sourced from this company's blockers */}
      {actions.length > 0 && (
        <>
          <section
            style={{
              backgroundColor: BRAND.ink,
              color: BRAND.cream,
              borderRadius: 12,
              padding: "20px 24px",
              marginTop: 16,
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: BRAND.cream,
                opacity: 0.7,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              What we need from {company.name} to clear this
            </p>
            <p
              className="font-[family-name:var(--font-fraunces)]"
              style={{ fontSize: 16, color: BRAND.cream, marginTop: 4 }}
            >
              Three actions, in order of impact.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3" style={{ gap: 14 }}>
              {actions.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    borderLeft: `2px solid ${i < 2 ? BRAND.dangerInk : BRAND.warningInk}`,
                    paddingLeft: 12,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 500, color: BRAND.cream }}>{a.title}</p>
                  <p style={{ fontSize: 12, color: BRAND.cream, opacity: 0.7, marginTop: 4 }}>
                    {a.consequence}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <p
            className="text-center italic"
            style={{ fontSize: 11, color: BRAND.inkMuted, marginTop: 12 }}
          >
            Same data Main Contractor sees · shared with {company.name} as part of integrated programme
            governance
          </p>
        </>
      )}
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

function PerfCol({
  eyebrow,
  value,
  valueColour,
  sub,
  divider,
}: {
  eyebrow: string;
  value: string;
  valueColour: string;
  sub: string;
  divider: boolean;
}) {
  return (
    <div style={divider ? { borderLeft: `0.5px solid ${BRAND.border}`, paddingLeft: 16 } : undefined}>
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
      <p
        className="font-[family-name:var(--font-fraunces)] font-semibold"
        style={{ fontSize: 24, lineHeight: 1.1, marginTop: 4, color: valueColour }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: BRAND.inkMuted, marginTop: 4 }}>{sub}</p>
    </div>
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
