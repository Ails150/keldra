import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Saved external contacts for a task (org-scoped) — quick-picks for the composer.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const taskCode = (new URL(request.url).searchParams.get("taskCode") ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing taskCode." }, { status: 400 });

  try {
    const { data } = await createAdminClient()
      .from("task_contacts")
      .select("email, name, company")
      .eq("org_id", actor.orgId)
      .eq("task_code", taskCode)
      .order("created_at", { ascending: false });
    return NextResponse.json({ contacts: data ?? [] });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}
