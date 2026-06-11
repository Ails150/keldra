import { NextResponse, type NextRequest } from "next/server";
import { getSessionState } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// Superadmin config surface: read every org's calibration, and save one org's.
// "Client calibration is data entry, not code."
export async function GET() {
  const state = await getSessionState();
  if (state.status !== "ready" || state.profile.role !== "superadmin") {
    return NextResponse.json({ error: "Superadmin only." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: orgs, error } = await admin
    .from("organisations")
    .select("id, name")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: configs } = await admin
    .from("org_config")
    .select("org_id, config, template, updated_at");
  const byOrg = new Map((configs ?? []).map((c) => [c.org_id, c]));

  return NextResponse.json({
    orgs: (orgs ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      config: byOrg.get(o.id)?.config ?? null,
      template: byOrg.get(o.id)?.template ?? null,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || state.profile.role !== "superadmin") {
    return NextResponse.json({ error: "Superadmin only." }, { status: 403 });
  }

  let body: { orgId?: string; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.orgId) {
    return NextResponse.json({ error: "Missing orgId." }, { status: 400 });
  }
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    return NextResponse.json({ error: "Config must be an object." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("org_config").upsert(
    {
      org_id: body.orgId,
      config: body.config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
