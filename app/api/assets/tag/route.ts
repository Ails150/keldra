import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;

// GET → the asset's commissioning tag + everything the drawer needs: current tag
// & status, named owner, the next-tag checklist (with per-item owner), dates +
// days-at-tag, and the who/what/where/when/why/how transition history. Scoped to
// the verified session's org. { tag: null } when untagged → the panel hides.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const assetId = (new URL(request.url).searchParams.get("assetId") ?? "").trim();
  if (!assetId) return NextResponse.json({ error: "Missing assetId." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("asset_tags")
    .select("tag, next_checklist, owner_name, owner_org, status, target_date, achieved_date")
    .eq("org_id", actor.orgId)
    .eq("asset_id", assetId)
    .maybeSingle<{
      tag: "red" | "yellow" | "green"; next_checklist: unknown;
      owner_name: string | null; owner_org: string | null; status: string | null;
      target_date: string | null; achieved_date: string | null;
    }>();

  if (!data?.tag) return NextResponse.json({ tag: null, checklist: [], history: [] });

  const { data: ev } = await admin
    .from("asset_tag_events")
    .select("seq, event_type, actor_name, actor_org, payload, ts")
    .eq("org_id", actor.orgId)
    .eq("asset_id", assetId)
    .order("seq", { ascending: false });

  const daysAtTag = data.achieved_date
    ? Math.max(0, Math.round((Date.now() - new Date(data.achieved_date).getTime()) / DAY))
    : null;

  return NextResponse.json({
    tag: data.tag,
    status: data.status ?? "in_progress",
    owner: data.owner_name ? { name: data.owner_name, org: data.owner_org ?? "" } : null,
    achievedDate: data.achieved_date,
    targetDate: data.target_date,
    daysAtTag,
    checklist: Array.isArray(data.next_checklist) ? data.next_checklist : [],
    history: (ev ?? []).map((e) => {
      const p = (e as { payload: Record<string, unknown> | null }).payload ?? {};
      return {
        seq: (e as { seq: number }).seq,
        eventType: (e as { event_type: string }).event_type,
        actorName: (e as { actor_name: string | null }).actor_name,
        actorOrg: (e as { actor_org: string | null }).actor_org,
        ts: (e as { ts: string }).ts,
        payload: p,
      };
    }),
  });
}
