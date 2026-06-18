import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendBlockerEvent } from "@/lib/blockers/events";

const MER_BUCKET = "mer-field-photos";

// Field capture → a real, dashboard-visible blocker. Authenticated server-side;
// org_id + identity come from the verified session (authedActor), NEVER the
// body. Writes the blockers row (full linkage the loader needs) + a hash-light
// "raised" event + a mer_field_events row for the task trail + the photo.
export async function POST(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Field/manager/org_admin/member can capture; viewers are read-only.
  if (actor.role === "viewer") {
    return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Body carries CONTENT only — never org_id/user_id.
  const taskCode = String(form.get("taskCode") ?? "").trim();
  const comment = String(form.get("comment") ?? "").trim();
  const why = String(form.get("why") ?? "").trim();
  const withParty = String(form.get("withParty") ?? "").trim();
  const photo = form.get("photo");

  if (!taskCode) return NextResponse.json({ error: "Pick a task." }, { status: 400 });

  const admin = createAdminClient();

  // Resolve the task within the actor's org (linkage + cost + name).
  const { data: task } = await admin
    .from("tasks")
    .select("id, name, affects_room, cost_per_day")
    .eq("org_id", actor.orgId)
    .eq("code", taskCode)
    .maybeSingle<{ id: string; name: string | null; affects_room: string | null; cost_per_day: number }>();

  // Photo upload (service role; org-scoped path so the storage RLS policy can
  // scope reads). Failure is reported, never swallowed.
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const bytes = Buffer.from(await photo.arrayBuffer());
    photoPath = `${actor.orgId}/${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from(MER_BUCKET)
      .upload(photoPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      return NextResponse.json({ error: `Photo upload failed: ${upErr.message}` }, { status: 502 });
    }
  }

  const description = [comment, why].filter(Boolean).join(" — ") || (task?.name ?? taskCode);
  const cost = Number(task?.cost_per_day) || 0;

  // 1. The dashboard-visible blocker (everything the loader filters on).
  const { data: blocker, error: bErr } = await admin
    .from("blockers")
    .insert({
      org_id: actor.orgId,
      task_id: task?.id ?? null,
      task_code: taskCode,
      title: task?.name ?? taskCode,
      description,
      held_by_company: withParty || null,
      affects_room: task?.affects_room ?? null,
      gate: "C",
      state: "unowned",
      status: "open",
      cost_per_day: cost,
      priority: cost >= 18000 ? "Critical" : cost >= 8000 ? "High" : "Medium",
      raised_by: actor.fullName || actor.email || "Field",
      since_timestamp: new Date().toISOString(),
      raised_date: new Date().toISOString(),
      linked_assets: [taskCode],
    })
    .select("id")
    .single<{ id: string }>();
  if (bErr || !blocker) {
    return NextResponse.json({ error: `Couldn't save blocker: ${bErr?.message}` }, { status: 500 });
  }

  // 2. Raised event (audit trail for the blocker) — server-computed hash chain.
  await appendBlockerEvent(admin, {
    blockerId: blocker.id,
    orgId: actor.orgId,
    eventType: "raised",
    actor: actor.fullName || actor.email || "Field",
    payload: { description, with_party: withParty || null, has_photo: !!photoPath },
  });

  // 3. mer_field_events row so it renders in the task Activity trail too.
  await admin.from("mer_field_events").insert({
    project: "MER",
    org_id: actor.orgId,
    actor_user_id: actor.userId,
    asset_id: taskCode,
    kind: "red_tag",
    comment: comment || description,
    with_party: withParty || null,
    gate: "C",
    photo_path: photoPath,
    actor: actor.fullName || actor.email || "Field",
    burn_per_day: cost,
  });

  return NextResponse.json({ ok: true, blockerId: blocker.id, photoPath });
}
