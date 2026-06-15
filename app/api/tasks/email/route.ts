import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { sendTaskEmail } from "@/lib/email/task-email";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attachmentAllowed,
  MAX_ATTACHMENTS,
  type OutAttachment,
} from "@/lib/email/attachments";

const FIELD_PHOTO_BUCKET = "mer-field-photos";

// "Email update" — works from the dashboard AND the field app (same threading,
// same reply.keldra.io task address, lands in the trail as outbound). Auth is
// server-side via authedActor (org derived from the verified session/Bearer,
// never the body). Any org member except viewers can email. The typed recipient
// is saved as a task contact for next time.
export async function POST(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) {
    return NextResponse.json({ error: "You need to be signed in to your organisation." }, { status: 401 });
  }
  if (actor.role === "viewer") {
    return NextResponse.json({ error: "Your role is read-only." }, { status: 403 });
  }
  const orgId = actor.orgId;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const taskCode = String(form.get("taskCode") ?? "").trim();
  const to = String(form.get("to") ?? "").trim().toLowerCase();
  const message = String(form.get("message") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim() || "Status update requested";
  const contactName = String(form.get("contactName") ?? "").trim();
  const contactCompany = String(form.get("contactCompany") ?? "").trim();

  if (!taskCode) return NextResponse.json({ error: "Missing task code." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  const admin = createAdminClient();
  const attachments: OutAttachment[] = [];

  // 1. Uploaded files (incl. the field composer's photo).
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const bytes = Buffer.from(await entry.arrayBuffer());
    const check = attachmentAllowed(entry.type, bytes.byteLength);
    if (!check.ok) {
      return NextResponse.json({ error: `"${entry.name}" rejected: ${check.reason}.` }, { status: 400 });
    }
    attachments.push({ filename: entry.name, contentType: entry.type || null, bytes });
  }

  // 2. Existing trail evidence (field-capture photo ids), org-checked.
  let evidenceIds: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("evidence") ?? "[]"));
    if (Array.isArray(parsed)) evidenceIds = parsed.map(String).slice(0, MAX_ATTACHMENTS);
  } catch {
    evidenceIds = [];
  }
  for (const id of evidenceIds) {
    const { data: ev } = await admin
      .from("mer_field_events")
      .select("id, org_id, photo_path")
      .eq("id", id)
      .maybeSingle<{ id: string; org_id: string | null; photo_path: string | null }>();
    if (!ev || ev.org_id !== orgId || !ev.photo_path) continue;
    const { data: blob, error } = await admin.storage.from(FIELD_PHOTO_BUCKET).download(ev.photo_path);
    if (error || !blob) continue;
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (!attachmentAllowed("image/jpeg", bytes.byteLength).ok) continue;
    attachments.push({ filename: `evidence-${id.slice(0, 8)}.jpg`, contentType: "image/jpeg", bytes });
  }

  if (attachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS}).` }, { status: 400 });
  }

  const senderName = actor.fullName || actor.email || "Keldra";
  const html = renderHtml({
    taskCode,
    message,
    senderName,
    orgName: actor.orgName ?? "Keldra",
    attachmentNames: attachments.map((a) => a.filename),
  });

  let emailId: string;
  try {
    const result = await sendTaskEmail({
      orgId,
      taskCode,
      to,
      subject,
      html,
      text: message || "Could you give us a quick status update on this item?",
      attachments,
      actorUserId: actor.userId,
    });
    emailId = result.emailId;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? "Couldn't send the email." }, { status: 502 });
  }

  // Save the typed recipient as a task contact for next time (best-effort).
  try {
    await admin.from("task_contacts").upsert(
      {
        org_id: orgId,
        task_code: taskCode,
        email: to,
        name: contactName || null,
        company: contactCompany || null,
      },
      { onConflict: "org_id,task_code,email" },
    );
  } catch {
    /* task_contacts not migrated yet — non-fatal */
  }

  return NextResponse.json({ ok: true, emailId, attachmentCount: attachments.length });
}

function renderHtml(opts: {
  taskCode: string;
  message: string;
  senderName: string;
  orgName: string;
  attachmentNames: string[];
}): string {
  const body = opts.message
    ? opts.message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")
    : "Could you give us a quick status update on this item?";
  const attachmentNote =
    opts.attachmentNames.length > 0
      ? `<p style="font-size:12px;color:#8a7da0;margin:12px 0 0;">${opts.attachmentNames.length} attachment(s): ${opts.attachmentNames
          .map((n) => n.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
          .join(", ")}</p>`
      : "";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a0f2b;line-height:1.5;">
    <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a5cad;margin:0 0 8px;">
      ${opts.orgName} · ${opts.taskCode}
    </p>
    <p style="margin:0 0 16px;">${body}</p>
    <p style="margin:0 0 4px;">— ${opts.senderName}</p>
    ${attachmentNote}
    <hr style="border:none;border-top:1px solid #eadff5;margin:20px 0;">
    <p style="font-size:12px;color:#8a7da0;margin:0;">
      Reply directly to this email and your message will appear on the task in Keldra.
    </p>
  </div>`;
}
