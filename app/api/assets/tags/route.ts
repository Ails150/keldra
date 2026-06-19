import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;

// GET → all asset tags for the org (for the asset LIST: tag, status, dates,
// days-at-tag, checklist progress). Org-scoped; the list merges these onto the
// register by asset_id. Anon → 401 → the list shows the register with no tags.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("asset_tags")
    .select("asset_id, tag, status, achieved_date, target_date, next_checklist")
    .eq("org_id", actor.orgId);

  const now = Date.now();
  const tags = (data ?? []).map((r) => {
    const cl = Array.isArray((r as { next_checklist: unknown }).next_checklist) ? ((r as { next_checklist: { status: string }[] }).next_checklist) : [];
    const done = cl.filter((i) => i.status === "approved").length;
    const achievedDate = (r as { achieved_date: string | null }).achieved_date;
    return {
      asset_id: (r as { asset_id: string }).asset_id,
      tag: (r as { tag: string }).tag,
      status: (r as { status: string | null }).status ?? "in_progress",
      achievedDate,
      targetDate: (r as { target_date: string | null }).target_date,
      daysAtTag: achievedDate ? Math.max(0, Math.round((now - new Date(achievedDate).getTime()) / DAY)) : null,
      done,
      total: cl.length,
    };
  });
  return NextResponse.json({ tags });
}
