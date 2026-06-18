import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET → the asset-level commissioning tag (red/yellow/green) + the checklist for
// the NEXT tag, for ONE asset, scoped to the verified session's org. Returns
// { tag: null } when the asset isn't tagged for this org (or pre-migration), so
// the panel simply hides the section. Read-only — no advance engine tonight.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const assetId = (new URL(request.url).searchParams.get("assetId") ?? "").trim();
  if (!assetId) return NextResponse.json({ error: "Missing assetId." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("asset_tags")
    .select("tag, next_checklist")
    .eq("org_id", actor.orgId)
    .eq("asset_id", assetId)
    .maybeSingle<{ tag: "red" | "yellow" | "green"; next_checklist: unknown }>();

  const checklist = Array.isArray(data?.next_checklist) ? data!.next_checklist : [];
  return NextResponse.json({ tag: data?.tag ?? null, checklist });
}
