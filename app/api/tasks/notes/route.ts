import { NextResponse, type NextRequest, after } from "next/server";
import { randomUUID } from "crypto";
import { authedActor, type ApiActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureThread, buildThreadAddress } from "@/lib/email/task-email";

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

  // Notify the task's OTHER assignees (after the 200). Recipients are derived
  // ONLY from task_assignments → org users — never task_contacts — so a note
  // notification can never reach an external party.
  if (task?.id) {
    const origin = new URL(request.url).origin;
    after(() => notifyAssignees(admin, actor, taskCode, task.id, body, origin));
  }
  return NextResponse.json({ ok: true });
}

async function notifyAssignees(
  admin: ReturnType<typeof createAdminClient>,
  actor: ApiActor,
  taskCode: string,
  taskId: string,
  body: string,
  origin: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    // SAME-ORG ASSIGNEES ONLY. The recipient list is built from
    // task_assignments (org-scoped) joined to the org's auth users. External
    // task_contacts are NOT consulted here — they can never be a recipient.
    const { data: asg } = await admin
      .from("task_assignments")
      .select("user_id")
      .eq("org_id", actor.orgId)
      .eq("task_id", taskId);
    const userIds = (asg ?? []).map((a) => a.user_id as string).filter((id) => id !== actor.userId);
    if (userIds.length === 0) return;

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email]));
    const recipients = userIds.map((id) => emailById.get(id)).filter((e): e is string => !!e);
    if (recipients.length === 0) return;

    // Send from the task thread address so a reply threads back onto the record.
    const thread = await ensureThread(admin, actor.orgId, taskCode);
    const from = `"Keldra · ${taskCode}" <${buildThreadAddress(thread.id, thread.email_token)}>`;
    const author = actor.fullName || actor.email || "A teammate";
    const link = `${origin}/dashboard/tasks/${encodeURIComponent(taskCode)}`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a0f2b;line-height:1.5;">
      <p><strong>${author}</strong> posted an internal note on <strong>${taskCode}</strong>:</p>
      <blockquote style="border-left:3px solid #0d9488;margin:0;padding:6px 12px;color:#334155;">${esc(body)}</blockquote>
      <p><a href="${link}" style="color:#8a3dd6;">Open the task in Keldra →</a></p></div>`;
    const text = `${author} posted an internal note on ${taskCode}:\n\n${body}\n\n${link}`;

    for (const to of recipients) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: `[${taskCode}] Internal note from ${author}`, html, text }),
      });
    }
  } catch (err) {
    console.error("[notes] assignee notification failed:", (err as Error).message);
  }
}
