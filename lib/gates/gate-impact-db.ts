import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { computeGateImpacts, impactNarrative, type Milestone } from "@/lib/gates/impact";

type Admin = ReturnType<typeof createAdminClient>;
const DAY = 86_400_000;

// The deadline-impact narrative for a task's blocked gate(s): the milestone at
// risk + the dependent gates, in plain words. Real data only; null when nothing
// is at risk. Shared by the AI summary + the trail PDF export.
export async function gateImpactNarrativeForTask(
  admin: Admin,
  orgId: string,
  taskCode: string,
): Promise<string | null> {
  const { data: bks } = await admin.from("blockers").select("gate, state").eq("org_id", orgId).eq("task_code", taskCode);
  const myGates = new Set(((bks ?? []) as { gate: string | null; state: string }[]).filter((b) => b.state !== "closed" && b.gate).map((b) => String(b.gate)));
  if (myGates.size === 0) return null;

  const { data: gatesRows } = await admin.from("gates").select("*").eq("org_id", orgId);
  if (!gatesRows || gatesRows.length === 0) return null;

  let milestones: Milestone[] = [];
  try {
    const { data: ms } = await admin.from("milestones").select("code,name,target_date").eq("org_id", orgId);
    milestones = ((ms ?? []) as { code: string; name: string | null; target_date: string | null }[]).map((m) => ({ code: String(m.code), name: m.name ?? null, target_date: m.target_date ?? null }));
  } catch {
    /* milestones table not migrated */
  }

  const { data: allB } = await admin.from("blockers").select("gate, state, since_timestamp, raised_date").eq("org_id", orgId);
  const now = Date.now();
  const stats = new Map<string, { open: number; oldest: number }>();
  for (const b of (allB ?? []) as { gate: string | null; state: string; since_timestamp: string | null; raised_date: string | null }[]) {
    if (b.state === "closed" || !b.gate) continue;
    const c = stats.get(String(b.gate)) ?? { open: 0, oldest: now };
    c.open += 1;
    const sv = new Date(b.since_timestamp || b.raised_date || "").getTime();
    if (!Number.isNaN(sv)) c.oldest = Math.min(c.oldest, sv);
    stats.set(String(b.gate), c);
  }

  const inputs = (gatesRows as Record<string, unknown>[]).map((g) => {
    const st = stats.get(String(g.code));
    return {
      code: String(g.code),
      target_date: (g.target_date as string) ?? null,
      milestone_code: (g.milestone_code as string) ?? null,
      depends_on: Array.isArray(g.depends_on) ? (g.depends_on as string[]) : [],
      blocked: !!st && st.open > 0,
      daysBlocked: st && st.open > 0 ? Math.max(0, Math.floor((now - st.oldest) / DAY)) : 0,
    };
  });
  const impacts = computeGateImpacts(inputs, milestones, now);

  let best: string | null = null;
  let bestSlip = -1;
  for (const gc of myGates) {
    const imp = impacts.get(gc);
    if (!imp) continue;
    const narrative = impactNarrative(imp, gc);
    if (narrative && imp.milestoneSlipDays > bestSlip) {
      bestSlip = imp.milestoneSlipDays;
      best = narrative;
    }
  }
  return best;
}
