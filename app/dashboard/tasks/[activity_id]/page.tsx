"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_BASELINE,
  type Baseline,
  type BaselineTask,
  type TaskStatus,
  companyColour,
  companyName,
  daysOpen,
  roomByCode,
  loadBaseline,
  taskById,
} from "../../lib/baseline-seed";
import { createClient } from "@/lib/supabase/client";
import {
  type Activity,
  type SilenceMetrics,
  buildSynopsis,
  listActivityForTask,
  metricsFor,
} from "@/lib/activity";
import { ActivityTimeline, LogActivityModal, Toast } from "../../activity-ui";
import LiveAssetHistory from "./live-asset-history";
import { useTaskEmails, EmailUpdateModal } from "./task-emails";
import SequencePanel from "./sequence-panel";
import {
  type MerFieldEvent,
  listAssetHistory,
  signedPhotoUrl,
  subscribeFieldEvents,
} from "@/lib/supabase/mer-field";

// A phone field capture (mer_field_events, keyed by task id) rendered as an
// Activity so it drops straight into the trail, synopsis and root-cause count.
function fieldKindLabel(kind: string): string {
  switch (kind) {
    case "red_tag": return "🔴 Red tag raised on site";
    case "photo": return "📷 Photo captured on site";
    case "comment": return "Site note";
    case "update": return "Site update";
    case "escalated": return "Escalated from site";
    case "response": return "Response from site";
    case "resolved": return "Resolved on site";
    default: return "Field entry";
  }
}

async function fieldEventToActivity(e: MerFieldEvent): Promise<Activity> {
  const photo_url = e.photo_path ? await signedPhotoUrl(e.photo_path).catch(() => null) : null;
  const withSuffix = e.with_party ? ` · with ${e.with_party}` : "";
  return {
    id: `field-${e.id}`,
    task_id: e.asset_id ?? "",
    project_id: "mer",
    type: "note",
    direction: "internal",
    channel: null,
    actor: { name: e.actor || "Field — Site Lead", company_slug: "field", role: e.role || "Field" },
    recipient: null,
    subject: fieldKindLabel(e.kind) + withSuffix,
    body: e.comment ?? "",
    attachments: [],
    metadata: { field: true, kind: e.kind, with_party: e.with_party, ...(photo_url ? { photo_url } : {}) },
    created_at: e.created_at,
    created_by: e.actor || "Field",
  };
}

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

type RootCause = {
  patternLabel: string;
  analysis: string;
  evidence: string[];
  verdict: string;
};

const ROOT_CAUSE: Record<string, RootCause> = {
  "ELE-COLO-1030": {
    patternLabel: "Deprioritisation — not a supply problem",
    analysis:
      "The genuine delay was week one — brackets were late from MEP Sub's manufacturer. Everything since has been MEP Sub deprioritising MER. When the brackets arrived on day 53, MEP Sub moved the crew to Project Brown instead.",
    evidence: [
      "Brackets arrived day 53 — crew diverted to Project Brown",
      'Three commitments made, three broken ("Friday", "next week", "2 lads")',
      "Formal escalation to Operations Manager unopened after 19 days",
      "Now blocking a second task — SCCR cabling — widening downstream impact",
    ],
    verdict:
      "This needs director-to-director escalation, not another chase. Site Lead and Operations Manager have stopped responding to PM-level contact.",
  },
  "MEC-COLO-1040": {
    patternLabel: "Stuck in design sign-off — traces to Hyperscale Client",
    analysis:
      "Design House has the water services package drafted but can't release Status A without Hyperscale Client director sign-off. Eighteen chases, four responses, all deflecting upward. This is not a Design House capacity problem — it's a Hyperscale Client decision sitting unmade.",
    evidence: [
      "Status A drafted but awaiting Hyperscale Client sign-off — 21 days",
      "18 chases, 22% response rate, 11-day average reply",
      "Formal escalation to Design Director (Director) unopened",
      "MMR1 first-fix cannot start until this releases",
    ],
    verdict:
      "Escalate to Hyperscale Client directly. Design House is waiting on the same sign-off you are.",
  },
  "FAB-ADMIN-1120": {
    patternLabel: "Design chain stalled three links deep",
    analysis:
      "Drawings Lead can sign the primary supports but not the lighting bracket details — those depend on Design Lead's spec, which depends on Design House's service routing, which depends on Hyperscale Client's power loading sign-off. The whole chain is frozen behind one Hyperscale Client decision.",
    evidence: [
      "Drawings Lead waiting on Design Lead for lighting spec — 21 days",
      "Design Lead waiting on Design House for service routing — 35 days",
      "Design House waiting on Hyperscale Client for power loading sign-off — 42 days",
      "Eleven chases, one partial response in eight weeks",
    ],
    verdict:
      "No amount of chasing Drawings Lead will move this. The decision lives at Hyperscale Client.",
  },
  "ELE-MER-1010": {
    patternLabel: "Your own scope — unstaffed, not blocked",
    analysis:
      "This isn't a sub holding you up — it's the MER1 earth bar, your own crew, with zero men assigned two days running against a baseline that says it should already be live. No external dependency, no open RFI, no design gate. It just needs a crew put on it today.",
    evidence: [
      "Baseline says earth bar live 13–14 May — day 2 with zero men assigned",
      "No blocking sub and no open RFI — fully within your control",
      "Earthing gates MER1 LV energisation — downstream of the whole power-on sequence",
      "£18k/day accruing on an item you can clear yourself",
    ],
    verdict:
      "No one to chase but yourselves. Assign a crew this morning and this clears today.",
  },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Map a DB `tasks` row to the BaselineTask shape the page renders.
function dbRowToTask(r: Record<string, unknown>): BaselineTask {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const n = (v: unknown) => (v == null ? 0 : Number(v));
  return {
    activity_id: s(r.code),
    name: s(r.name) || s(r.code),
    wbs_path: s(r.wbs_path),
    responsible_company: s(r.responsible_company),
    planned_start: s(r.planned_start),
    planned_end: s(r.planned_end),
    planned_manpower: n(r.planned_manpower),
    actual_manpower: n(r.actual_manpower),
    status: (s(r.status) || "on_track") as TaskStatus,
    blocked_reason: r.blocked_reason == null ? null : String(r.blocked_reason),
    blocking_company: r.blocking_company == null ? null : String(r.blocking_company),
    affects_room: r.affects_room == null ? null : String(r.affects_room),
    cost_per_day: n(r.cost_per_day),
  };
}

export default function TaskPage() {
  const params = useParams();
  const activityId = decodeURIComponent(String(params.activity_id ?? ""));
  // Live field items are keyed by asset id (MER-…) and read their history from Supabase.
  if (/^MER-/.test(activityId)) return <LiveAssetHistory assetId={activityId} />;
  return <SeededTaskPage activityId={activityId} />;
}

function SeededTaskPage({ activityId }: { activityId: string }) {
  const [baseline, setBaseline] = useState<Baseline>(DEFAULT_BASELINE);
  const [logged, setLogged] = useState<Activity[]>([]);
  const [fieldActivity, setFieldActivity] = useState<Activity[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Email thread for this task (org-scoped). Empty + canEmail=false for the
  // anonymous public demo, so the demo path is untouched.
  const { activities: emailActivity, canEmail, reload: reloadEmails } =
    useTaskEmails(activityId);

  // DB read-path cutover (tasks): for an authenticated org, prefer the task row
  // from the DB; fall back to the localStorage seed if the DB has no such row
  // (empty / unmigrated). Anonymous/demo visitors never query the DB (req #1).
  const [dbTask, setDbTask] = useState<BaselineTask | null>(null);
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return; // anon/demo → seed only
        const { data } = await supabase
          .from("tasks")
          .select(
            "code,name,wbs_path,responsible_company,blocking_company,status,blocked_reason,affects_room,planned_start,planned_end,planned_manpower,actual_manpower,cost_per_day",
          )
          .eq("code", activityId)
          .maybeSingle();
        if (!cancelled && data) setDbTask(dbRowToTask(data));
      } catch {
        /* fall back to seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  useEffect(() => setBaseline(loadBaseline()), []);
  useEffect(() => {
    setLogged(listActivityForTask(activityId));
  }, [activityId]);

  // Live phone field captures for this task, merged into the trail. Re-fetch +
  // re-subscribe on open and on focus/visibility so an open page never goes
  // stale, plus realtime INSERT/DELETE for instant cross-device updates.
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    let unsub = () => {};
    const load = async () => {
      try {
        const hist = await listAssetHistory(activityId);
        const mapped = await Promise.all(hist.map(fieldEventToActivity));
        if (!cancelled) setFieldActivity(mapped);
      } catch (err) {
        console.warn("field trail load:", (err as Error)?.message);
      }
    };
    const resubscribe = () => {
      try { unsub(); } catch {}
      unsub = subscribeFieldEvents({
        onInsert: async (e) => {
          if ((e.asset_id ?? "") !== activityId) return;
          const a = await fieldEventToActivity(e);
          setFieldActivity((p) => (p.some((x) => x.id === a.id) ? p : [...p, a]));
        },
        onDelete: (id) => setFieldActivity((p) => p.filter((x) => x.id !== `field-${id}`)),
      });
    };
    const resync = () => { void load(); resubscribe(); };
    resync();
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", resync);
    return () => {
      cancelled = true;
      try { unsub(); } catch {}
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", resync);
    };
  }, [activityId]);

  // The trail the whole page reads from: logged (localStorage) + live field.
  const activity = useMemo(
    () =>
      [...logged, ...fieldActivity, ...emailActivity].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [logged, fieldActivity, emailActivity],
  );
  const metrics = useMemo<SilenceMetrics>(() => metricsFor(activity), [activity]);

  // Field-capture photos on this task, offered as one-tick "attach evidence"
  // thumbnails in the email modal (the chase-with-the-photo flow).
  const evidence = useMemo(
    () =>
      fieldActivity
        .filter((a) => a.metadata.photo_url)
        .map((a) => ({
          id: a.id.replace(/^field-/, ""),
          name: a.subject || "Field photo",
          thumbUrl: a.metadata.photo_url ?? null,
        })),
    [fieldActivity],
  );

  function refresh() {
    setLogged(listActivityForTask(activityId));
  }
  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }

  const task = dbTask ?? taskById(baseline, activityId);

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

          <RootCausePanel taskId={task.activity_id} entryCount={activity.length} />

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
        <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
          <SequencePanel taskCode={task.activity_id} canManage={canEmail} />
          <div className="overflow-hidden rounded-xl" style={{ border: `0.5px solid ${BRAND.border}` }}>
            <div className="px-5 py-4" style={{ borderBottom: `0.5px solid ${BRAND.border}` }}>
              <div className="flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-fraunces)] text-ink" style={{ fontSize: 16 }}>
                  Activity trail
                </h2>
                <div className="flex items-center gap-2">
                  {canEmail && (
                    <button
                      type="button"
                      onClick={() => setEmailOpen(true)}
                      className="rounded text-xs font-medium text-ink"
                      style={{ border: `0.5px solid ${BRAND.border}`, padding: "6px 12px" }}
                    >
                      ✉ Email update
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLogOpen(true)}
                    className="rounded text-xs font-medium text-paper"
                    style={{ backgroundColor: BRAND.purple, padding: "6px 12px" }}
                  >
                    + Log activity
                  </button>
                </div>
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
      {emailOpen && (
        <EmailUpdateModal
          taskCode={task.activity_id}
          evidence={evidence}
          onClose={() => setEmailOpen(false)}
          onSent={() => {
            reloadEmails();
            showToast("Email sent · reply will land on this trail");
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </main>
  );
}

function RootCausePanel({ taskId, entryCount }: { taskId: string; entryCount: number }) {
  const rc = ROOT_CAUSE[taskId];

  return (
    <div
      style={{
        backgroundColor: "#f6f0fc",
        border: `0.5px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span style={{ color: BRAND.purple, fontSize: 13, lineHeight: 1 }}>✦</span>
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: BRAND.purple,
              fontWeight: 600,
            }}
          >
            Root Cause · AI Analysis
          </span>
        </div>
        {rc && (
          <span style={{ fontSize: 9, fontStyle: "italic", color: BRAND.inkMuted }}>
            Generated from {entryCount} trail entries
          </span>
        )}
      </div>

      {rc ? (
        <>
          <p
            className="font-[family-name:var(--font-fraunces)]"
            style={{ fontSize: 16, color: BRAND.ink, marginTop: 12, lineHeight: 1.2 }}
          >
            {rc.patternLabel}
          </p>
          <p style={{ fontSize: 13, color: BRAND.ink, lineHeight: 1.5, marginTop: 8 }}>
            {rc.analysis}
          </p>
          <ol style={{ marginTop: 12 }}>
            {rc.evidence.map((point, i) => (
              <div
                key={i}
                className="flex items-baseline"
                style={{ gap: 8, padding: "3px 0" }}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 13, color: BRAND.purple, fontWeight: 600 }}
                >
                  {i + 1}.
                </span>
                <span style={{ fontSize: 13, color: BRAND.ink, lineHeight: 1.4 }}>{point}</span>
              </div>
            ))}
          </ol>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.ink,
              borderLeft: `2px solid ${BRAND.dangerInk}`,
              paddingLeft: 10,
              marginTop: 14,
              lineHeight: 1.45,
            }}
          >
            {rc.verdict}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.5, marginTop: 10 }}>
          Root cause analysis available in pilot — AI reads the full trail and surfaces the
          pattern.
        </p>
      )}
    </div>
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
