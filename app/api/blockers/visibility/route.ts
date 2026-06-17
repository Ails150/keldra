import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canWrite } from "@/lib/auth/profile";

// POST → set a blocker's visibility ('shared' | 'org_private'). OWNER-ONLY: the
// blocker's org_id must equal the verified session's org — a client can never
// flip another org's blocker. Mirrors the task_notes privacy model (org_id is
// the owner). Writes go through the service role; ownership is asserted here.
export async function POST(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canWrite(actor.role)) return NextResponse.json({ error: "Your role can't change visibility." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const blockerId = String(body.blockerId ?? "").trim();
  const visibility = String(body.visibility ?? "");
  if (!blockerId) return NextResponse.json({ error: "Missing blockerId." }, { status: 400 });
  if (visibility !== "shared" && visibility !== "org_private") {
    return NextResponse.json({ error: "visibility must be 'shared' or 'org_private'." }, { status: 400 });
  }

  const admin = createAdminClient();
  // Ownership: scope the update to (id AND actor's org). A different org's
  // blocker simply doesn't match → not found, never updated.
  const { data: updated, error } = await admin
    .from("blockers")
    .update({ visibility })
    .eq("id", blockerId)
    .eq("org_id", actor.orgId)
    .select("id, visibility")
    .maybeSingle<{ id: string; visibility: string }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Blocker not found for your org." }, { status: 404 });
  return NextResponse.json({ ok: true, id: updated.id, visibility: updated.visibility });
}
