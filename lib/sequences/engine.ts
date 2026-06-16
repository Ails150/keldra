import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTaskEmail } from "@/lib/email/task-email";

const DAY = 86_400_000;

export type SeqStep = {
  n: number;
  // Escalating cadence: days to wait AFTER the previous step (or after the
  // start / original silence for step 0) before this chase fires. Tighter early,
  // widening later. All values live in org_config — never hardcoded here.
  gap_days: number;
  cc_escalation?: boolean;
  flag_to_report?: boolean;
  subject: string;
  body: string;
};
export type SeqConfig = {
  enabled: boolean;
  daily_send_cap: number;
  timezone: string;
  working_hours: { start: string; end: string; days: number[] };
  steps: SeqStep[];
  // Grace after the final chase before auto-escalation fires.
  escalate_after_days: number;
  // Who escalation notifies. NEVER guessed — only used when the org has set it.
  escalation_owner_email: string | null;
};

// Empty/off fallback only — the real per-org cadence lives in org_config.
// No steps here means nothing chases until an org's config is loaded.
const FALLBACK: SeqConfig = {
  enabled: false,
  daily_send_cap: 50,
  timezone: "Europe/Dublin",
  working_hours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  steps: [],
  escalate_after_days: 0,
  escalation_owner_email: null,
};

// Does an inbound sender count as "the awaited party replied"? Exact address
// match, or same email domain (a colleague of the chased party answering on the
// thread still counts; an unrelated party or internal note does NOT). This is
// the single place the awaited-party rule is enforced — used by both the inbound
// pause path and the tick's pre-send reply check.
export function isAwaitedParty(fromEmail: string | null | undefined, toEmail: string | null | undefined): boolean {
  const f = (fromEmail ?? "").trim().toLowerCase();
  const t = (toEmail ?? "").trim().toLowerCase();
  if (!f || !t) return false;
  if (f === t) return true;
  const fd = f.split("@")[1];
  const td = t.split("@")[1];
  return !!fd && fd === td;
}

type Admin = ReturnType<typeof createAdminClient>;

async function seqConfig(admin: Admin, orgId: string): Promise<SeqConfig> {
  const { data } = await admin
    .from("org_config")
    .select("config")
    .eq("org_id", orgId)
    .maybeSingle<{ config: { sequence?: Partial<SeqConfig> } }>();
  const s = data?.config?.sequence ?? {};
  return { ...FALLBACK, ...s, steps: s.steps ?? [] } as SeqConfig;
}

function render(tpl: string, ctx: Record<string, string>): string {
  return (tpl ?? "").replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");
}

function htmlFrom(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a0f2b;line-height:1.5;"><p>${esc}</p></div>`;
}

// Is `now` within the org's working hours/days (in the org timezone)?
export function withinWorkingHours(cfg: SeqConfig, now: Date = new Date()): boolean {
  const tz = cfg.timezone || "Europe/Dublin";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[get("weekday")] ?? 1;
  if (!(cfg.working_hours.days ?? []).includes(wd)) return false;
  const hh = get("hour") === "24" ? "00" : get("hour");
  const cur = `${hh.padStart(2, "0")}:${get("minute").padStart(2, "0")}`;
  return cur >= cfg.working_hours.start && cur <= cfg.working_hours.end;
}

async function sentToday(admin: Admin, orgId: string): Promise<number> {
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("sequence_audit")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("action", "sent")
    .gte("created_at", midnightUtc.toISOString());
  return count ?? 0;
}

async function audit(
  admin: Admin,
  row: { sequence_id: string; org_id: string; task_code: string; step: number; action: string; detail?: string },
) {
  await admin.from("sequence_audit").insert(row);
}

// Start (or restart) a sequence for a task. next step fires at start + offset.
export async function startSequence(
  admin: Admin,
  o: {
    orgId: string;
    taskCode: string;
    to: string;
    deadline?: string | null;
    escalationContact?: string | null;
    gateCode?: string | null;
    gateDate?: string | null;
    commitmentQuote?: string | null;
    createdBy?: string | null;
    // Auto-start passes true: the task has ALREADY been silent ≥ step-1 gap, so
    // chase 1 fires now. Manual start waits the first gap before chase 1.
    immediate?: boolean;
  },
): Promise<{ id: string }> {
  const cfg = await seqConfig(admin, o.orgId);
  const steps = cfg.steps;
  const startedAt = new Date();
  const nextRun = steps[0]
    ? o.immediate
      ? startedAt.toISOString()
      : new Date(startedAt.getTime() + steps[0].gap_days * DAY).toISOString()
    : null;

  const { data, error } = await admin
    .from("task_sequences")
    .upsert(
      {
        org_id: o.orgId,
        task_code: o.taskCode,
        status: "active",
        current_step: 0,
        total_steps: steps.length,
        to_email: o.to,
        escalation_contact: o.escalationContact ?? null,
        commitment_quote: o.commitmentQuote ?? null,
        gate_code: o.gateCode ?? null,
        gate_date: o.gateDate ?? null,
        deadline: o.deadline ?? null,
        started_at: startedAt.toISOString(),
        next_run_at: nextRun,
        paused_reason: null,
        created_by: o.createdBy ?? null,
      },
      { onConflict: "org_id,task_code" },
    )
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "Couldn't start sequence.");

  await audit(admin, {
    sequence_id: data.id,
    org_id: o.orgId,
    task_code: o.taskCode,
    step: 0,
    action: "started",
    detail: `Sequence started · ${steps.length} steps`,
  });
  return { id: data.id };
}

// Pause an active sequence for a task when the AWAITED PARTY replies. Called
// from the inbound webhook with the inbound sender: an unrelated reply (or an
// internal note from another address) must NOT silence the chase. The sender
// match is enforced here via isAwaitedParty against the sequence's to_email.
export async function pauseSequenceForTask(
  admin: Admin,
  orgId: string,
  taskCode: string,
  reason: string,
  fromEmail?: string | null,
): Promise<void> {
  const { data: seq } = await admin
    .from("task_sequences")
    .select("id, to_email")
    .eq("org_id", orgId)
    .eq("task_code", taskCode)
    .eq("status", "active")
    .maybeSingle<{ id: string; to_email: string }>();
  if (!seq) return;
  // If we know the sender, only pause when it's the awaited party.
  if (fromEmail !== undefined && fromEmail !== null && !isAwaitedParty(fromEmail, seq.to_email)) return;

  await admin.from("task_sequences").update({ status: "paused", paused_reason: reason }).eq("id", seq.id);
  await audit(admin, { sequence_id: seq.id, org_id: orgId, task_code: taskCode, step: 0, action: "paused", detail: reason });
}

export async function setSequenceStatus(
  admin: Admin,
  id: string,
  status: "active" | "paused" | "stopped",
): Promise<void> {
  const { data: seq } = await admin
    .from("task_sequences")
    .select("id, org_id, task_code, current_step, started_at")
    .eq("id", id)
    .maybeSingle<{ id: string; org_id: string; task_code: string; current_step: number; started_at: string }>();
  if (!seq) return;

  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    // Manual resume: let the pending step fire on the next tick (still gated by
    // working hours / cap / awaited-reply check inside advanceDueSequences).
    patch.next_run_at = new Date().toISOString();
    patch.paused_reason = null;
  }
  await admin.from("task_sequences").update(patch).eq("id", id);
  await audit(admin, {
    sequence_id: id,
    org_id: seq.org_id,
    task_code: seq.task_code,
    step: seq.current_step,
    action: status === "active" ? "resumed" : status === "stopped" ? "completed" : "paused",
    detail: `manual ${status}`,
  });
}

type TickSummary = { processed: number; sent: number; paused: number; skipped: number; escalated: number };

// The pg_cron tick: advance every due active sequence, honouring enable flag,
// working hours, daily cap and pause-on-reply. Sends are gated by enabled.
export async function advanceDueSequences(admin: Admin): Promise<TickSummary> {
  const summary: TickSummary = { processed: 0, sent: 0, paused: 0, skipped: 0, escalated: 0 };
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("task_sequences")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .limit(500);
  if (!due || due.length === 0) return summary;

  const cfgCache = new Map<string, SeqConfig>();
  const sendCount = new Map<string, number>();

  for (const seq of due as Record<string, unknown>[]) {
    summary.processed++;
    const orgId = seq.org_id as string;
    const taskCode = seq.task_code as string;
    const stepIdx = seq.current_step as number;

    let cfg = cfgCache.get(orgId);
    if (!cfg) {
      cfg = await seqConfig(admin, orgId);
      cfgCache.set(orgId, cfg);
    }
    // Pause-on-reply: ONLY the awaited party (the chased to_email, or its
    // domain) pausing the chase. An unrelated reply or internal note must not
    // silence it. Enforced via isAwaitedParty.
    const { data: inboundRows } = await admin
      .from("task_emails")
      .select("from_email")
      .eq("org_id", orgId)
      .eq("task_code", taskCode)
      .eq("direction", "inbound")
      .gte("created_at", seq.started_at as string);
    const awaitedReplied = (inboundRows ?? []).some((r) =>
      isAwaitedParty(r.from_email as string, seq.to_email as string),
    );
    if (awaitedReplied) {
      await admin.from("task_sequences").update({ status: "paused", paused_reason: "awaited party replied" }).eq("id", seq.id as string);
      await audit(admin, { sequence_id: seq.id as string, org_id: orgId, task_code: taskCode, step: stepIdx, action: "paused", detail: "awaited party replied" });
      summary.paused++;
      continue;
    }

    // Off-by-default: do not send (or escalate) until the org opts in. Leave it
    // due so it resumes once enabled (no audit spam).
    if (!cfg.enabled) {
      summary.skipped++;
      continue;
    }

    const step = cfg.steps[stepIdx];
    // Past the final chase + grace, still no awaited reply → ESCALATE (real
    // action, not a silent complete). This is where flag_to_report is wired.
    if (!step) {
      await escalateSequence(admin, seq, cfg);
      summary.escalated++;
      continue;
    }

    if (!withinWorkingHours(cfg)) {
      summary.skipped++;
      continue; // retry next tick within hours
    }

    let todays = sendCount.get(orgId);
    if (todays === undefined) {
      todays = await sentToday(admin, orgId);
      sendCount.set(orgId, todays);
    }
    if (todays >= cfg.daily_send_cap) {
      summary.skipped++;
      continue;
    }

    // Render + send.
    const daysSilent = Math.max(0, Math.floor((Date.now() - new Date(seq.started_at as string).getTime()) / DAY));
    const ctx: Record<string, string> = {
      task_code: taskCode,
      commitment_quote: (seq.commitment_quote as string) ?? "",
      gate_code: (seq.gate_code as string) ?? "",
      gate_date: (seq.gate_date as string) ?? "",
      days_silent: String(daysSilent),
      escalation_contact: (seq.escalation_contact as string) ?? "",
    };
    const subject = render(step.subject, ctx);
    const body = render(step.body, ctx);
    // CC the escalation contact on cc steps — only if we actually have one.
    const cc =
      step.cc_escalation && seq.escalation_contact ? [seq.escalation_contact as string] : undefined;

    try {
      await sendTaskEmail({
        orgId,
        taskCode,
        to: seq.to_email as string,
        cc,
        subject,
        html: htmlFrom(body),
        text: body,
        actorUserId: (seq.created_by as string) ?? null,
      });
    } catch {
      summary.skipped++;
      continue; // transient send failure — retry next tick
    }

    sendCount.set(orgId, todays + 1);
    summary.sent++;
    await audit(admin, {
      sequence_id: seq.id as string,
      org_id: orgId,
      task_code: taskCode,
      step: step.n,
      action: "sent",
      detail: `auto-chase step ${step.n}${cc ? ` · cc ${cc[0]}` : ""}`,
    });

    // flag_to_report (previously dead config): a step flagged to the report
    // flags the task's open blocker(s) onto the project report the moment that
    // chase goes out — a trail note + blocker event the AI summary/report read.
    if (step.flag_to_report) {
      await flagTaskToReport(admin, seq, step);
    }

    // Escalating cadence: the next gap is measured from THIS send. After the
    // final chase, schedule the escalation grace instead of completing — the
    // sequence stays active so the escalate branch fires once the grace elapses.
    const nextIdx = stepIdx + 1;
    const nextStep = cfg.steps[nextIdx];
    const gapDays = nextStep ? nextStep.gap_days : cfg.escalate_after_days;
    const nextRun = new Date(Date.now() + Math.max(0, gapDays) * DAY).toISOString();
    await admin.from("task_sequences").update({ current_step: nextIdx, next_run_at: nextRun }).eq("id", seq.id as string);
  }

  return summary;
}

// The task's open (non-closed) blocker(s): match by task_code first, then fall
// back to blockers that merely link the task as an asset. Shared by the
// flag-to-report and escalation paths so both act on the same set.
async function openBlockersForTask(
  admin: Admin,
  orgId: string,
  taskCode: string,
): Promise<{ id: string }[]> {
  const { data: byCode } = await admin
    .from("blockers")
    .select("id")
    .eq("org_id", orgId)
    .eq("task_code", taskCode)
    .neq("state", "closed");
  if (byCode && byCode.length > 0) return byCode as { id: string }[];
  const { data: byAsset } = await admin
    .from("blockers")
    .select("id")
    .eq("org_id", orgId)
    .contains("linked_assets", [taskCode])
    .neq("state", "closed");
  return (byAsset ?? []) as { id: string }[];
}

// flag_to_report wiring: when a chase step marked flag_to_report fires, flag the
// task's open blocker(s) onto the project report at SEND time — a blocker event
// + an immutable trail note — so the report / AI summary surface "flagged to
// report" before (and independently of) full escalation. Was dead config.
async function flagTaskToReport(
  admin: Admin,
  seq: Record<string, unknown>,
  step: SeqStep,
): Promise<void> {
  const orgId = seq.org_id as string;
  const taskCode = seq.task_code as string;
  const awaited = (seq.to_email as string) ?? "";
  const blks = await openBlockersForTask(admin, orgId, taskCode);
  for (const b of blks) {
    const { data: last } = await admin
      .from("blocker_events")
      .select("seq")
      .eq("blocker_id", b.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle<{ seq: number }>();
    await admin.from("blocker_events").insert({
      blocker_id: b.id,
      org_id: orgId,
      seq: ((last?.seq ?? -1) as number) + 1,
      event_type: "flagged_to_report",
      actor: "Keldra",
      payload: { step: step.n, awaited_party: awaited, reason: "final-notice chase flagged to project report" },
    });
  }
  await admin.from("task_notes").insert({
    org_id: orgId,
    task_code: taskCode,
    body: `Flagged to the project report — ${taskCode}: chase ${step.n} (final notice) sent to ${awaited || "the awaited party"} with no reply. This blocker now appears on the project report.`,
    author_name: "Keldra",
    author_id: null,
    mentions: [],
  });
  await audit(admin, {
    sequence_id: seq.id as string,
    org_id: orgId,
    task_code: taskCode,
    step: step.n,
    action: "flagged-to-report",
    detail: `step ${step.n} flagged ${taskCode} to the project report`,
  });
}

// Real escalation: the awaited party never replied after the final chase. Stop
// chasing, set the task's open blocker(s) to "escalated", write an immutable
// "escalated — N chases, 0 responses" trail note (which the AI summary reads),
// and notify the org's escalation owner if one is configured (never guessed).
async function escalateSequence(
  admin: Admin,
  seq: Record<string, unknown>,
  cfg: SeqConfig,
): Promise<void> {
  const orgId = seq.org_id as string;
  const taskCode = seq.task_code as string;
  const awaited = (seq.to_email as string) ?? "";

  const { count: chaseCount } = await admin
    .from("sequence_audit")
    .select("*", { count: "exact", head: true })
    .eq("sequence_id", seq.id as string)
    .eq("action", "sent");
  const chases = chaseCount ?? 0;

  // 1. Escalate the task's open blocker(s). Match by task_code, else linked_assets.
  const blks = await openBlockersForTask(admin, orgId, taskCode);
  const flaggedToReport = cfg.steps.some((s) => s.flag_to_report);
  const nowIso = new Date().toISOString();
  for (const b of blks) {
    await admin.from("blockers").update({ state: "escalated", since_timestamp: nowIso }).eq("id", b.id);
    const { data: last } = await admin
      .from("blocker_events")
      .select("seq")
      .eq("blocker_id", b.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle<{ seq: number }>();
    await admin.from("blocker_events").insert({
      blocker_id: b.id,
      org_id: orgId,
      seq: ((last?.seq ?? -1) as number) + 1,
      event_type: "escalated",
      actor: "Keldra",
      payload: { chases, responses: 0, awaited_party: awaited, flag_to_report: flaggedToReport, reason: "no reply after final chase" },
    });
  }

  // 2. Immutable trail note — gatherTrail() reads task_notes, so the AI summary
  //    + ball-in-court surface "escalated — N chases, 0 responses".
  const noteBody = `Escalated — ${chases} chase${chases === 1 ? "" : "s"}, 0 responses from ${awaited || "the awaited party"}. No reply after the final notice; blocker set to escalated.`;
  await admin.from("task_notes").insert({
    org_id: orgId,
    task_code: taskCode,
    body: noteBody,
    author_name: "Keldra",
    author_id: null,
    mentions: [],
  });

  // 3. Notify the escalation owner — ONLY if the org configured one.
  const owner = (cfg.escalation_owner_email ?? "").trim();
  if (owner) {
    try {
      await sendTaskEmail({
        orgId,
        taskCode,
        to: owner,
        subject: `Escalation — ${taskCode} unresolved after ${chases} chases`,
        html: htmlFrom(`${noteBody}\n\nKeldra auto-escalated this task: ${awaited || "the awaited party"} did not respond to ${chases} chases. It needs director attention.`),
        text: noteBody,
        actorUserId: null,
      });
    } catch {
      /* notification is best-effort; the escalation itself stands */
    }
  }

  // 4. Audit + stop chasing.
  await audit(admin, {
    sequence_id: seq.id as string,
    org_id: orgId,
    task_code: taskCode,
    step: cfg.steps.length,
    action: "escalated",
    detail: `escalated to ${owner || "(no owner configured)"} · ${chases} chases, 0 responses`,
  });
  await admin.from("task_sequences").update({ status: "completed", next_run_at: null }).eq("id", seq.id as string);
}

// Auto-start on silence (run from the tick). For each org with sequences ENABLED,
// find tasks that have an outbound chase, no awaited-party reply since, silent
// longer than the step-1 gap, and no existing sequence → start one (chase 1 fires
// immediately, since the silence precondition is already met). to_email is the
// awaited party derived from the thread (the last outbound recipient). Global +
// org-scoped: cadence + enable come from each org's config; nothing hardcoded.
export async function autoStartSilentSequences(admin: Admin): Promise<{ started: number; scanned: number }> {
  let started = 0;
  let scanned = 0;

  const { data: cfgRows } = await admin.from("org_config").select("org_id, config");
  for (const row of (cfgRows ?? []) as { org_id: string; config: { sequence?: Partial<SeqConfig> } }[]) {
    const s = row.config?.sequence ?? {};
    const cfg = { ...FALLBACK, ...s, steps: s.steps ?? [] } as SeqConfig;
    if (!cfg.enabled || cfg.steps.length === 0) continue;
    const orgId = row.org_id;
    const chase1Gap = cfg.steps[0].gap_days ?? 0;
    const cutoffIso = new Date(Date.now() - chase1Gap * DAY).toISOString();

    const { data: emails } = await admin
      .from("task_emails")
      .select("task_code, to_email, from_email, direction, created_at")
      .eq("org_id", orgId);

    type Em = { task_code: string; to_email: string; from_email: string; direction: string; created_at: string };
    const byTask = new Map<string, { lastOut?: Em; inbound: Em[] }>();
    for (const e of (emails ?? []) as Em[]) {
      if (!e.task_code) continue;
      const g = byTask.get(e.task_code) ?? { inbound: [] as Em[] };
      if (e.direction === "outbound") {
        if (!g.lastOut || e.created_at > g.lastOut.created_at) g.lastOut = e;
      } else {
        g.inbound.push(e);
      }
      byTask.set(e.task_code, g);
    }

    const { data: existing } = await admin.from("task_sequences").select("task_code").eq("org_id", orgId);
    const has = new Set((existing ?? []).map((x) => (x as { task_code: string }).task_code));

    for (const [taskCode, g] of byTask) {
      scanned++;
      if (!g.lastOut) continue; // need an outbound chase to chase about
      if (has.has(taskCode)) continue; // already has a sequence (any status)
      if (g.lastOut.created_at > cutoffIso) continue; // not silent long enough yet
      const awaited = g.lastOut.to_email;
      const replied = g.inbound.some(
        (i) => i.created_at > g.lastOut!.created_at && isAwaitedParty(i.from_email, awaited),
      );
      if (replied) continue; // the awaited party already responded
      await startSequence(admin, { orgId, taskCode, to: awaited, immediate: true });
      started++;
    }
  }

  return { started, scanned };
}
