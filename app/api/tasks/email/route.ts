import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, canWrite } from "@/lib/auth/profile";
import { sendTaskEmail } from "@/lib/email/task-email";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attachmentAllowed,
  MAX_ATTACHMENTS,
  type OutAttachment,
} from "@/lib/email/attachments";

// Field-capture photos live in this private bucket, keyed by mer_field_events
// (which carries org_id). We resolve selected evidence server-side and re-check
// the org before attaching, so a client can't reference another org's files.
const FIELD_PHOTO_BUCKET = "mer-field-photos";

// "Email update" from the task panel, now multipart so it can carry attachments:
//  - uploaded files (allowlist + 10MB each), and/or
//  - existing trail evidence (field-capture photos) selected by id.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id) {
    return NextResponse.json(
      { error: "You need to be signed in to your organisation to send email." },
      { status: 403 },
    );
  }
  if (!canWrite(state.profile.role)) {
    return NextResponse.json(
      { error: "Your role is read-only." },
      { status: 403 },
    );
  }
  const orgId = state.profile.org_id;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const taskCode = String(form.get("taskCode") ?? "").trim();
  const to = String(form.get("to") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim() || "Status update requested";

  if (!taskCode) {
    return NextResponse.json({ error: "Missing task code." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  const attachments: OutAttachment[] = [];

  // 1. Uploaded files.
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const bytes = Buffer.from(await entry.arrayBuffer());
    const check = attachmentAllowed(entry.type, bytes.byteLength);
    if (!check.ok) {
      return NextResponse.json(
        { error: `"${entry.name}" rejected: ${check.reason}.` },
        { status: 400 },
      );
    }
    attachments.push({
      filename: entry.name,
      contentType: entry.type || null,
      bytes,
    });
  }

  // 2. Existing trail evidence (field-capture photo ids), org-checked.
  let evidenceIds: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("evidence") ?? "[]"));
    if (Array.isArray(parsed)) evidenceIds = parsed.map(String).slice(0, MAX_ATTACHMENTS);
  } catch {
    evidenceIds = [];
  }

  if (evidenceIds.length > 0) {
    const admin = createAdminClient();
    for (const id of evidenceIds) {
      const { data: ev } = await admin
        .from("mer_field_events")
        .select("id, org_id, photo_path")
        .eq("id", id)
        .maybeSingle<{ id: string; org_id: string | null; photo_path: string | null }>();
      // Skip anything not in the caller's org or without a photo.
      if (!ev || ev.org_id !== orgId || !ev.photo_path) continue;

      const { data: blob, error } = await admin.storage
        .from(FIELD_PHOTO_BUCKET)
        .download(ev.photo_path);
      if (error || !blob) continue;

      const bytes = Buffer.from(await blob.arrayBuffer());
      const check = attachmentAllowed("image/jpeg", bytes.byteLength);
      if (!check.ok) continue;
      attachments.push({
        filename: `evidence-${id.slice(0, 8)}.jpg`,
        contentType: "image/jpeg",
        bytes,
      });
    }
  }

  if (attachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Too many attachments (max ${MAX_ATTACHMENTS}).` },
      { status: 400 },
    );
  }

  const senderName = state.profile.full_name || state.email;
  const html = renderHtml({
    taskCode,
    message,
    senderName,
    orgName: state.profile.org_name ?? "Keldra",
    attachmentNames: attachments.map((a) => a.filename),
  });

  try {
    const result = await sendTaskEmail({
      orgId,
      taskCode,
      to,
      subject,
      html,
      text: message || "Could you give us a quick status update on this item?",
      attachments,
      actorUserId: state.profile.id,
    });
    return NextResponse.json({
      ok: true,
      emailId: result.emailId,
      attachmentCount: attachments.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Couldn't send the email." },
      { status: 502 },
    );
  }
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
