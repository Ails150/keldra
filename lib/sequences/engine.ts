import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTaskEmail } from "@/lib/email/task-email";

const DAY = 86_400_000;

export type SeqStep = {
  n: number;
  offset_days: number;
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
};

const FALLBACK: SeqConfig = {
  enabled: false,
  daily_send_cap: 50,
  timezone: "Europe/Dublin",
  working_hours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  steps: [],
};

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
  },
): Promise<{ id: string }> {
  const cfg = await seqConfig(admin, o.orgId);
  const steps = cfg.steps;
  const startedAt = new Date();
  const nextRun = steps[0]
    ? new Date(startedAt.getTime() + steps[0].offset_days * DAY).toISOString()
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

// Pause any active sequence for a task (called when an inbound reply lands).
export async function pauseSequenceForTask(
  admin: Admin,
  orgId: string,
  taskCode: string,
  reason: string,
): Promise<void> {
  const { data } = await admin
    .from("task_sequences")
    .update({ status: "paused", paused_reason: reason })
    .eq("org_id", orgId)
    .eq("task_code", taskCode)
    .eq("status", "active")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (data) {
    await audit(admin, { sequence_id: data.id, org_id: orgId, task_code: taskCode, step: 0, action: "paused", detail: reason });
  }
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
    const cfg = await seqConfig(admin, seq.org_id);
    const step = cfg.steps[seq.current_step];
    const base = new Date(seq.started_at).getTime();
    const due = step ? base + step.offset_days * DAY : Date.now();
    patch.next_run_at = new Date(Math.max(due, Date.now())).toISOString();
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

type TickSummary = { processed: number; sent: number; paused: number; skipped: number };

// The pg_cron tick: advance every due active sequence, honouring enable flag,
// working hours, daily cap and pause-on-reply. Sends are gated by enabled.
export async function advanceDueSequences(admin: Admin): Promise<TickSummary> {
  const summary: TickSummary = { processed: 0, sent: 0, paused: 0, skipped: 0 };
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
    const step = cfg.steps[stepIdx];
    if (!step) {
      await admin.from("task_sequences").update({ status: "completed", next_run_at: null }).eq("id", seq.id as string);
      continue;
    }

    // Off-by-default: do not send until the org opts in. Leave it due so it
    // fires once enabled (no audit spam).
    if (!cfg.enabled) {
      summary.skipped++;
      continue;
    }

    // Pause-on-reply: any inbound email on this task pauses the sequence.
    const { count: inbound } = await admin
      .from("task_emails")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("task_code", taskCode)
      .eq("direction", "inbound")
      .gte("created_at", seq.started_at as string);
    if (inbound && inbound > 0) {
      await admin.from("task_sequences").update({ status: "paused", paused_reason: "inbound reply" }).eq("id", seq.id as string);
      await audit(admin, { sequence_id: seq.id as string, org_id: orgId, task_code: taskCode, step: stepIdx, action: "paused", detail: "inbound reply" });
      summary.paused++;
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

    // Advance (offsets are from started_at).
    const nextIdx = stepIdx + 1;
    if (nextIdx >= cfg.steps.length) {
      await admin.from("task_sequences").update({ current_step: nextIdx, status: "completed", next_run_at: null }).eq("id", seq.id as string);
      await audit(admin, { sequence_id: seq.id as string, org_id: orgId, task_code: taskCode, step: nextIdx, action: "completed", detail: "all steps sent" });
    } else {
      const base = new Date(seq.started_at as string).getTime();
      const nextRun = new Date(base + cfg.steps[nextIdx].offset_days * DAY).toISOString();
      await admin.from("task_sequences").update({ current_step: nextIdx, next_run_at: nextRun }).eq("id", seq.id as string);
    }
  }

  return summary;
}
