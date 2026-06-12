import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MER_BUCKET = "mer-field-photos";

// GET ?taskCode → this task's internal notes (SAME ORG ONLY — org derived from
// the verified session, never the body), with signed photo URLs.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const taskCode = (new URL(request.url).searchParams.get("taskCode") ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing taskCode." }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("task_notes")
    .select("id, body, photo_path, author_name, created_at")
    .eq("org_id", actor.orgId)
    .eq("task_code", taskCode)
    .order("created_at", { ascending: true });

  const notes = await Promise.all(
    (data ?? []).map(async (n) => {
      let photoUrl: string | null = null;
      if (n.photo_path) {
        const { data: s } = await admin.storage.from(MER_BUCKET).createSignedUrl(n.photo_path, 3600);
        photoUrl = s?.signedUrl ?? null;
      }
      return { id: n.id, body: n.body, author: n.author_name, created_at: n.created_at, photoUrl };
    }),
  );
  return NextResponse.json({ notes });
}

// POST (multipart: body + optional photo) → an immutable internal note.
// Viewers are read-only; everyone else in the org can post.
export async function POST(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (actor.role === "viewer") {
    return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const taskCode = String(form.get("taskCode") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const photo = form.get("photo");
  if (!taskCode || !body) {
    return NextResponse.json({ error: "Note text is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const bytes = Buffer.from(await photo.arrayBuffer());
    photoPath = `${actor.orgId}/notes/${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage.from(MER_BUCKET).upload(photoPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) return NextResponse.json({ error: `Photo upload failed: ${upErr.message}` }, { status: 502 });
  }

  const { data: task } = await admin
    .from("tasks")
    .select("id")
    .eq("org_id", actor.orgId)
    .eq("code", taskCode)
    .maybeSingle<{ id: string }>();

  const { error } = await admin.from("task_notes").insert({
    org_id: actor.orgId,
    task_code: taskCode,
    task_id: task?.id ?? null,
    body,
    photo_path: photoPath,
    author_id: actor.userId,
    author_name: actor.fullName || actor.email || "Team member",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
