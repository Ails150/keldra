// Blocker → deadline impact chain. A blocked gate doesn't just burn £/day — it
// threatens a milestone and blocks the gates that depend on it. This computes,
// from REAL data only, the projected slip of a blocked gate and propagates it to
// dependent gates + the linked milestone. Missing dates are reported as "target
// not set" — never invented. Pure functions; no org ids / dates hardcoded.

const DAY = 86_400_000;

export type Milestone = { code: string; name: string | null; target_date: string | null };

export type GateImpactInput = {
  code: string;
  target_date: string | null;
  milestone_code: string | null;
  depends_on: string[];
  blocked: boolean;
  daysBlocked: number;
};

export type GateImpact = {
  code: string;
  blocked: boolean;
  slipDays: number; // own slip vs this gate's target (days already late), 0 if within target / no target
  effectiveSlipDays: number; // own slip OR inherited from an upstream gate it depends on, whichever is larger
  daysBlocked: number;
  blocksGates: string[]; // gate codes that depend on this gate
  milestoneName: string | null;
  milestoneTarget: string | null; // ISO date or null
  milestoneProjected: string | null; // target + effective slip, or null when target not set
  milestoneSlipDays: number;
  hasMilestone: boolean;
};

function iso(d: number): string {
  return new Date(d).toISOString().slice(0, 10);
}

// Days a blocked gate is already late vs its own target (0 if no target / on time).
function ownSlip(g: GateImpactInput, now: number): number {
  if (!g.blocked || !g.target_date) return 0;
  const t = new Date(g.target_date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export function computeGateImpacts(
  gates: GateImpactInput[],
  milestones: Milestone[],
  now: number = Date.now(),
): Map<string, GateImpact> {
  const byCode = new Map(gates.map((g) => [g.code, g]));
  const msByCode = new Map(milestones.map((m) => [m.code, m]));

  // Effective slip = own slip, propagated up the depends_on chain (a gate can't
  // clear before the gates it depends on clear). Memoised + cycle-safe.
  const memo = new Map<string, number>();
  const eff = (code: string, stack: Set<string>): number => {
    if (memo.has(code)) return memo.get(code)!;
    if (stack.has(code)) return 0; // dependency cycle — don't loop
    const g = byCode.get(code);
    if (!g) return 0;
    stack.add(code);
    let s = ownSlip(g, now);
    for (const dep of g.depends_on ?? []) s = Math.max(s, eff(dep, stack));
    stack.delete(code);
    memo.set(code, s);
    return s;
  };

  const dependents = new Map<string, string[]>();
  for (const g of gates) {
    for (const dep of g.depends_on ?? []) {
      const arr = dependents.get(dep) ?? [];
      arr.push(g.code);
      dependents.set(dep, arr);
    }
  }

  const out = new Map<string, GateImpact>();
  for (const g of gates) {
    const effectiveSlipDays = eff(g.code, new Set());
    const ms = g.milestone_code ? msByCode.get(g.milestone_code) ?? null : null;
    const mTarget = ms?.target_date ?? null;
    const mProjected = mTarget ? iso(new Date(mTarget).getTime() + effectiveSlipDays * DAY) : null;
    out.set(g.code, {
      code: g.code,
      blocked: g.blocked,
      slipDays: ownSlip(g, now),
      effectiveSlipDays,
      daysBlocked: g.daysBlocked,
      blocksGates: (dependents.get(g.code) ?? []).slice().sort(),
      milestoneName: ms?.name ?? (g.milestone_code || null),
      milestoneTarget: mTarget,
      milestoneProjected: mProjected,
      milestoneSlipDays: effectiveSlipDays,
      hasMilestone: !!ms,
    });
  }
  return out;
}

// One-liner for cards/overview: "£20k/day · threatens Beneficial Use by 41 days · blocks Gate D, E".
export function impactBadge(imp: GateImpact | undefined, burnPerDay: number): string {
  const parts: string[] = [];
  if (burnPerDay > 0) parts.push(`£${Math.round(burnPerDay / 1000)}k/day`);
  if (imp?.milestoneName) {
    parts.push(
      imp.milestoneTarget
        ? `threatens ${imp.milestoneName} by ${imp.milestoneSlipDays} day${imp.milestoneSlipDays === 1 ? "" : "s"}`
        : `threatens ${imp.milestoneName} (target not set)`,
    );
  }
  if (imp?.blocksGates.length) parts.push(`blocks Gate ${imp.blocksGates.join(", ")}`);
  return parts.join(" · ");
}

// Full plain-words chain for the AI insight / PDF / detail. Honest about missing dates.
export function impactNarrative(imp: GateImpact | undefined, gateCode: string): string | null {
  if (!imp) return null;
  if (!imp.blocked && imp.effectiveSlipDays === 0 && imp.daysBlocked === 0) return null;
  const lead = `Gate ${gateCode} blocked ${imp.daysBlocked} day${imp.daysBlocked === 1 ? "" : "s"}`;
  const segs: string[] = [lead];
  if (imp.milestoneName) {
    if (imp.milestoneTarget && imp.milestoneProjected) {
      segs.push(
        `${imp.milestoneName} projected ${imp.milestoneProjected} vs target ${imp.milestoneTarget} = ${imp.milestoneSlipDays} day${imp.milestoneSlipDays === 1 ? "" : "s"} late`,
      );
    } else {
      segs.push(`${imp.milestoneName} target not set`);
    }
  }
  if (imp.blocksGates.length) segs.push(`Gate ${imp.blocksGates.join(", ")} cannot start until ${gateCode} clears`);
  return segs.join(" → ") + ".";
}
