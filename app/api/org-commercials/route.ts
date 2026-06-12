import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

type Commercials = { gate_rates?: Record<string, number>; standing_rate?: number | null };

// GET — the org's commercials + its gate list (any org member can read).
export async function GET() {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("org_config")
    .select("config")
    .eq("org_id", state.profile.org_id)
    .maybeSingle<{ config: { commercials?: Commercials } }>();
  const { data: gates } = await admin
    .from("gates")
    .select("code, name, sort")
    .eq("org_id", state.profile.org_id)
    .order("sort");
  return NextResponse.json({
    commercials: cfg?.config?.commercials ?? { gate_rates: {}, standing_rate: null },
    gates: gates ?? [],
    canEdit: isAdminRole(state.profile.role),
  });
}

// PUT — org admins set the per-gate day rates + standing rate (self-serve).
export async function PUT(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  let body: { commercials?: Commercials };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const gate_rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.commercials?.gate_rates ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) gate_rates[k] = Math.round(n);
  }
  const standingRaw = body.commercials?.standing_rate;
  const standing_rate =
    standingRaw == null || standingRaw === ("" as unknown) ? null : Math.max(0, Math.round(Number(standingRaw) || 0));

  const admin = createAdminClient();
  const { data: cur } = await admin
    .from("org_config")
    .select("config")
    .eq("org_id", state.profile.org_id)
    .maybeSingle<{ config: Record<string, unknown> }>();
  const config = { ...(cur?.config ?? {}), commercials: { gate_rates, standing_rate } };
  const { error } = await admin
    .from("org_config")
    .upsert(
      { org_id: state.profile.org_id, config, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
