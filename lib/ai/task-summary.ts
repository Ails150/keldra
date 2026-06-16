import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateImpactNarrativeForTask } from "@/lib/gates/gate-impact-db";

type Admin = ReturnType<typeof createAdminClient>;

export type TaskSummary = {
  where: string;
  changed: string;
  insight: string;
  entryCount: number;
  newestAt: string | null;
  generatedAt: string;
  source: "gemini" | "rules" | "cache";
};

const DAY = 86_400_000;

// Gather the FULL current trail for a task (emails, field events, blockers,
// internal notes) + task facts, oldest→newest, with a count + newest timestamp.
async function gatherTrail(admin: Admin, orgId: string, taskCode: string) {
  const [emailsR, fieldR, blockersR, taskR, notesR] = await Promise.all([
    admin.from("task_emails").select("direction, from_email, to_email, subject, body_text, created_at").eq("org_id", orgId).eq("task_code", taskCode),
    admin.from("mer_field_events").select("kind, comment, with_party, actor, created_at").eq("org_id", orgId).eq("asset_id", taskCode),
    admin.from("blockers").select("state, title, description, cost_per_day, held_by_company, raised_date, created_at").eq("org_id", orgId).eq("task_code", taskCode),
    admin.from("tasks").select("name, status, blocked_reason, cost_per_day, planned_start, planned_end, responsible_company, blocking_company, affects_room").eq("org_id", orgId).eq("code", taskCode).maybeSingle(),
    admin.from("task_notes").select("body, author_name, created_at").eq("org_id", orgId).eq("task_code", taskCode).then((r) => r, () => ({ data: [] as any[] })),
  ]);

  const events: { ts: string; line: string }[] = [];
  for (const e of emailsR.data ?? []) {
    const who = e.direction === "inbound" ? `inbound from ${e.from_email}` : `outbound to ${e.to_email}`;
    events.push({ ts: e.created_at, line: `EMAIL (${who}) "${e.subject ?? ""}": ${(e.body_text ?? "").slice(0, 300)}` });
  }
  for (const f of fieldR.data ?? []) {
    events.push({ ts: f.created_at, line: `FIELD ${f.kind} by ${f.actor}${f.with_party ? ` (with ${f.with_party})` : ""}: ${(f.comment ?? "").slice(0, 200)}` });
  }
  for (const n of (notesR as any).data ?? []) {
    events.push({ ts: n.created_at, line: `INTERNAL NOTE by ${n.author_name}: ${(n.body ?? "").slice(0, 300)}` });
  }
  for (const b of blockersR.data ?? []) {
    events.push({ ts: b.created_at ?? b.raised_date, line: `BLOCKER [${b.state}] ${b.title ?? ""} — ${(b.description ?? "").slice(0, 200)} (held by ${b.held_by_company ?? "?"}, £${b.cost_per_day}/day)` });
  }
  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const task = taskR.data as any;
  const newestAt = events.length ? events[events.length - 1].ts : null;
  const daysOpen = task?.planned_start ? Math.max(0, Math.floor((Date.now() - new Date(task.planned_start).getTime()) / DAY)) : null;
  const impact = await gateImpactNarrativeForTask(admin, orgId, taskCode);

  return { events, count: events.length, newestAt, task, daysOpen, impact };
}

async function generate(
  taskCode: string,
  trail: Awaited<ReturnType<typeof gatherTrail>>,
): Promise<{ where: string; changed: string; insight: string; source: "gemini" | "rules" }> {
  const t = trail.task ?? {};
  const facts = [
    `Task ${taskCode}: ${t.name ?? ""}`,
    `Status: ${t.status ?? "?"}`,
    t.blocked_reason ? `Blocked reason: ${t.blocked_reason}` : "",
    `Cost of delay: £${t.cost_per_day ?? 0}/day`,
    trail.daysOpen != null ? `Days open: ${trail.daysOpen}` : "",
    t.blocking_company ? `Held by: ${t.blocking_company}` : "",
    trail.impact ? `DEADLINE IMPACT: ${trail.impact}` : "",
  ].filter(Boolean).join("\n");
  const trailText = trail.events.map((e) => `- ${e.ts.slice(0, 16)} ${e.line}`).join("\n") || "(no trail entries yet)";

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && trail.events.length > 0) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generationConfig: any = { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } };
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig });
      const prompt = `You are Keldra, a construction accountability AI. Summarise ONE task for a busy director in plain words, grounded ONLY in the data. Reference the NEWEST communications/events, not stale state.

${facts}

TRAIL (oldest → newest):
${trailText}

Return JSON exactly:
{
  "where": "2-3 plain sentences on where this task stands right now",
  "changed": "what changed most recently and what it means — cite the latest email/field/note (who, when, and whether it included a date/commitment). If nothing changed recently, say so.",
  "insight": "ONE sharp line: the next move the data implies. If a DEADLINE IMPACT is given, NAME the milestone/gate at risk and the days late — the deadline is the point, not the daily burn."
}
Cite real names, dates and £ from the data. Do not invent.`;
      const result = (await Promise.race([
        model.generateContent(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 14000)),
      ])) as any;
      const parsed = JSON.parse(result.response.text());
      if (parsed.where || parsed.changed || parsed.insight) {
        return { where: parsed.where ?? "", changed: parsed.changed ?? "", insight: parsed.insight ?? "", source: "gemini" };
      }
    } catch (err) {
      console.error("[task-summary] gemini failed, using rules:", (err as Error).message);
    }
  }

  // Rule-based fallback.
  const last = trail.events[trail.events.length - 1];
  return {
    where: `${taskCode} is ${t.status ?? "open"}${trail.daysOpen != null ? `, ${trail.daysOpen} days open` : ""}${t.cost_per_day ? `, costing £${t.cost_per_day}/day` : ""}. ${t.blocked_reason ?? ""}`.trim(),
    changed: last ? `Latest: ${last.line}` : "No trail activity yet.",
    insight: trail.impact
      ? trail.impact
      : t.cost_per_day >= 18000
        ? "High exposure — escalate director-to-director."
        : "Chase the responsible party for a dated commitment.",
    source: "rules",
  };
}

// Read the cache; regenerate when the trail moved (entry count or newest ts) so
// we never serve a summary older than the newest entry. Cache is best-effort —
// if task_summaries isn't migrated yet we just regenerate every call.
export async function getTaskSummary(
  admin: Admin,
  orgId: string,
  taskCode: string,
  force = false,
): Promise<TaskSummary> {
  const trail = await gatherTrail(admin, orgId, taskCode);

  let cache: any = null;
  try {
    const { data } = await admin.from("task_summaries").select("*").eq("org_id", orgId).eq("task_code", taskCode).maybeSingle();
    cache = data;
  } catch {
    /* table not migrated */
  }

  const fresh =
    !force &&
    cache &&
    cache.entry_count === trail.count &&
    (!trail.newestAt || (cache.newest_at && cache.newest_at >= trail.newestAt));
  if (fresh) {
    return {
      where: cache.where_text, changed: cache.changed_text, insight: cache.insight_text,
      entryCount: cache.entry_count, newestAt: cache.newest_at, generatedAt: cache.generated_at, source: "cache",
    };
  }

  const gen = await generate(taskCode, trail);
  const generatedAt = new Date().toISOString();
  try {
    await admin.from("task_summaries").upsert(
      {
        org_id: orgId, task_code: taskCode,
        where_text: gen.where, changed_text: gen.changed, insight_text: gen.insight,
        entry_count: trail.count, newest_at: trail.newestAt, model: gen.source, generated_at: generatedAt,
      },
      { onConflict: "org_id,task_code" },
    );
  } catch {
    /* table not migrated — return fresh anyway */
  }
  return { ...gen, entryCount: trail.count, newestAt: trail.newestAt, generatedAt };
}
