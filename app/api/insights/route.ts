import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Note: `export const dynamic = 'force-dynamic'` was removed — it's no longer a
// supported route-segment-config option in Next 16 (see route-segment-config
// docs). A POST handler that reads the request body is dynamic regardless.
export const runtime = 'nodejs';

interface ProjectState {
  projectName: string;
  blockers: Array<any>;
  assets: Array<any>;
  people: Array<any>;
  totalExposurePerDay: number;
  unownedCount: number;
  awaitingInputCount: number;
  // Present only when a P6 XER has been ingested — the open critical-path
  // activities, each flagged if its linked asset has an open blocker.
  criticalActivities?: Array<{
    task_code: string;
    task_name: string;
    target_end: string | null;
    asset_id: string | null;
    blocked: boolean;
  }>;
}

export async function POST(req: NextRequest) {
  const projectState: ProjectState = await req.json();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ alerts: generateRuleBasedAlerts(projectState), source: 'rules' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Disable 2.5-flash's default "thinking" — with the full project payload it
    // pushes latency to ~22s (over the 15s budget). Off, it returns in ~5s.
    // thinkingConfig isn't in the SDK's GenerationConfig type yet but the v1beta
    // API honours it, so it's passed through an untyped object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generationConfig: any = {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    };
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig,
    });

    const prompt = buildPrompt(projectState);
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ]) as any;

    const text = result.response.text();
    const parsed = JSON.parse(text);
    return NextResponse.json({ alerts: parsed.alerts || [], source: 'gemini' });
  } catch (err) {
    console.error('Gemini call failed, falling back to rules:', err);
    return NextResponse.json({ alerts: generateRuleBasedAlerts(projectState), source: 'rules' });
  }
}

function buildPrompt(state: ProjectState): string {
  return `You are Keldra, an AI accountability layer for construction projects. Analyse this project state and return 4-6 actionable insights as JSON.

Project: ${state.projectName}
Total exposure today: £${state.totalExposurePerDay.toLocaleString()}/day
Unowned blockers: ${state.unownedCount}
Awaiting input >48h: ${state.awaitingInputCount}

BLOCKERS:
${JSON.stringify(state.blockers, null, 2)}

ASSETS (summary):
${JSON.stringify(state.assets.slice(0, 20), null, 2)}

PEOPLE:
${JSON.stringify(state.people, null, 2)}
${
  state.criticalActivities && state.criticalActivities.length
    ? `\nCRITICAL PATH (from P6 schedule — open activities; "blocked" means the linked asset has an open blocker):\n${JSON.stringify(state.criticalActivities, null, 2)}\n`
    : ""
}
Return JSON in this exact shape:
{
  "alerts": [
    {
      "type": "PATTERN" | "TREND" | "ALERT" | "RECOMMENDATION" | "CRITICAL_PATH_RISK",
      "title": "Short, specific title (max 8 words)",
      "body": "1-2 sentence explanation citing specific people, asset IDs, days, or £ figures from the data above",
      "action_label": "What button to show (max 4 words, e.g. 'View Design Lead's chain')",
      "action_target": "blocker:<id>" | "person:<name>" | "asset:<asset_id>" | "filter:unowned" | "tab:schedule" | "tab:constraints"
    }
  ]
}

Be specific. Cite real names and IDs from the data. Identify cross-organisation handoff failures, dependency bottlenecks, cost trajectories, and recurring patterns. If critical-path activities are blocked or due to complete within ~7 days, emit a CRITICAL_PATH_RISK alert citing the specific activity IDs and their linked assets and the downstream cascade, with action_target "tab:schedule". Do NOT generate generic insights. Do NOT include alerts that aren't grounded in the data.`;
}

function generateRuleBasedAlerts(state: ProjectState) {
  const alerts: any[] = [];

  // Rule 0: Critical-path risk (only fires when a P6 XER has been ingested).
  const crit = state.criticalActivities ?? [];
  if (crit.length > 0) {
    const horizon = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const atRisk = crit.filter(
      (a) => a.blocked || (a.target_end !== null && a.target_end <= horizon),
    );
    if (atRisk.length > 0) {
      const cites = atRisk
        .slice(0, 3)
        .map((a) => `${a.task_code}${a.asset_id ? ` (${a.asset_id})` : ""}`)
        .join(" and ");
      const blockedNote = atRisk.some((a) => a.blocked)
        ? " Both blocked."
        : "";
      alerts.push({
        type: "CRITICAL_PATH_RISK",
        title: `${atRisk.length} critical path ${atRisk.length === 1 ? "activity" : "activities"} at risk this week`,
        body: `${cites} on the critical path with planned completion this week.${blockedNote} A single-day slip cascades through downstream activities.`,
        action_label: "Open critical path",
        action_target: "tab:schedule",
      });
    }
  }

  // Rule 1: Person bottleneck — anyone blocking 3+ items
  const ownerCounts: Record<string, { count: number; cost: number; ids: string[] }> = {};
  for (const b of state.blockers) {
    if (b.state === 'awaiting-input' && b.owner_name) {
      const key = b.owner_name;
      if (!ownerCounts[key]) ownerCounts[key] = { count: 0, cost: 0, ids: [] };
      ownerCounts[key].count++;
      ownerCounts[key].cost += b.cost_per_day || 0;
      ownerCounts[key].ids.push(b.id);
    }
  }
  const bottleneck = Object.entries(ownerCounts).find(([_, v]) => v.count >= 3);
  if (bottleneck) {
    const [name, data] = bottleneck;
    alerts.push({
      type: 'PATTERN',
      title: `${data.count} blockers waiting on ${name}`,
      body: `Combined cost £${data.cost.toLocaleString()}/day. Single-person dependency across ${data.count} items — recommend escalation or workload review.`,
      action_label: `View ${name.split(' ')[0]}'s chain`,
      action_target: `person:${name}`
    });
  }

  // Rule 2: Unowned exposure
  if (state.unownedCount > 0) {
    const unownedCost = state.blockers
      .filter(b => b.state === 'unowned')
      .reduce((sum, b) => sum + (b.cost_per_day || 0), 0);
    alerts.push({
      type: 'ALERT',
      title: `${state.unownedCount} unowned blockers · £${unownedCost.toLocaleString()}/day`,
      body: `No one has accepted responsibility. Recommend PM acceptance round Monday morning to assign ownership.`,
      action_label: 'Open unowned',
      action_target: 'filter:unowned'
    });
  }

  // Rule 3: Cost trajectory
  const days = 5;
  const projected = state.totalExposurePerDay * days;
  alerts.push({
    type: 'TREND',
    title: `£${projected.toLocaleString()} accumulated by end of week`,
    body: `At current exposure of £${state.totalExposurePerDay.toLocaleString()}/day, the project accumulates £${projected.toLocaleString()} of cost-of-delay across the next ${days} working days.`,
    action_label: 'See breakdown',
    action_target: 'tab:constraints'
  });

  // Rule 4: Pattern across owner-unclear
  const unownedAssets = state.assets.filter(a => !a.owner_name);
  if (unownedAssets.length >= 3) {
    const locations = [...new Set(unownedAssets.map(a => a.location).filter(Boolean))];
    alerts.push({
      type: 'PATTERN',
      title: `${unownedAssets.length} assets without named owner`,
      body: `Spread across ${locations.length} locations (${locations.slice(0, 3).join(', ')}). Pattern: handoff ambiguity between organisations. Suggest org-level scope clarification.`,
      action_label: 'View assets',
      action_target: 'tab:assets'
    });
  }

  // Rule 5: Long-standing constraint
  const oldest = state.blockers
    .filter(b => b.state !== 'closed')
    .sort((a, b) => (b.days_open || 0) - (a.days_open || 0))[0];
  if (oldest && oldest.days_open > 30) {
    alerts.push({
      type: 'RECOMMENDATION',
      title: `Blocker open ${oldest.days_open} days`,
      body: `"${oldest.description}" has been open since ${oldest.date_raised}. Total accumulated cost: £${((oldest.cost_per_day || 0) * (oldest.days_open || 0)).toLocaleString()}. Recommend stakeholder escalation.`,
      action_label: 'Open blocker',
      action_target: `blocker:${oldest.id}`
    });
  }

  return alerts.slice(0, 6);
}
