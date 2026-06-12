import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseThreadAddress } from "@/lib/email/task-email";
import { verifyResendWebhook } from "@/lib/email/svix";
import { bestInboundBody } from "@/lib/email/strip-quote";
import { attachmentAllowed, storeEmailAttachment } from "@/lib/email/attachments";
import { pauseSequenceForTask } from "@/lib/sequences/engine";
import {
  getReceivedEmail,
  listReceivedAttachments,
  downloadAttachment,
} from "@/lib/email/resend-inbound";

// Resend inbound webhook (email.received). The webhook is METADATA ONLY — the
// body + attachment content are fetched from the Received Emails API using
// data.email_id. Order:
//  1. Verify the Svix signature.
//  2. Match the To-address to a thread (+ token). No match → 202 + dead-letter.
//  3. Fetch the real body via the API, strip the quote, insert + return 200.
//  4. Fetch + store attachments after responding (after()), logging failures.
export async function POST(request: NextRequest) {
  const raw = await request.text();

  const ok = verifyResendWebhook(
    raw,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SECRET,
  );
  if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const data = (event.data ?? event) as Record<string, unknown>;
  const emailId = s(data.email_id) || s(data.id);
  const recipients = extractRecipients(data);
  const fromEmail = extractEmail(data.from) ?? "";
  const subject = s(data.subject);
  const messageId = s(data.message_id) || null;

  const admin = createAdminClient();

  // Match a recipient to a real thread with a matching token.
  let matched: { threadId: string; orgId: string; taskCode: string; to: string } | null = null;
  for (const addr of recipients) {
    const parsed = parseThreadAddress(addr);
    if (!parsed) continue;
    const { data: thread } = await admin
      .from("task_threads")
      .select("id, org_id, task_code, email_token")
      .eq("id", parsed.threadId)
      .maybeSingle<{ id: string; org_id: string; task_code: string; email_token: string }>();
    if (thread && thread.email_token === parsed.token) {
      matched = { threadId: thread.id, orgId: thread.org_id, taskCode: thread.task_code, to: addr };
      break;
    }
  }

  if (!matched) {
    await admin.from("inbound_unmatched").insert({
      to_email: recipients.join(", "),
      from_email: fromEmail,
      subject,
      reason: recipients.some((a) => /task-[0-9a-f]{32}-/.test(a))
        ? "token mismatch / unknown thread"
        : "no task address in recipients",
      raw: event as never,
    });
    return NextResponse.json({ status: "unmatched" }, { status: 202 });
  }

  // Fetch the REAL body from the Received Emails API (webhook has none).
  let cleanText = "";
  let html: string | null = null;
  let fetchError: string | null = null;
  if (emailId) {
    try {
      const full = await getReceivedEmail(emailId);
      html = full.html ?? null;
      cleanText = bestInboundBody(full.text, full.html);
    } catch (err) {
      fetchError = (err as Error).message;
      console.error("[inbound] body fetch failed:", fetchError);
    }
  } else {
    fetchError = "no email_id in webhook payload";
    console.error("[inbound]", fetchError);
  }
  if (!cleanText) cleanText = fetchError ? `(couldn't load message body: ${fetchError})` : "(no message body)";

  let actorUserId: string | null = null;
  if (fromEmail) {
    const { data: uid } = await admin.rpc("user_id_by_email", { p_email: fromEmail });
    if (typeof uid === "string") actorUserId = uid;
  }

  const { data: row, error } = await admin
    .from("task_emails")
    .insert({
      thread_id: matched.threadId,
      org_id: matched.orgId,
      task_code: matched.taskCode,
      direction: "inbound",
      from_email: fromEmail,
      to_email: matched.to,
      subject,
      body_text: cleanText,
      body_html: html,
      message_id: messageId,
      actor_user_id: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !row) {
    await admin.from("inbound_unmatched").insert({
      to_email: matched.to,
      from_email: fromEmail,
      subject,
      reason: `insert failed: ${error?.message ?? "unknown"}`,
      raw: event as never,
    });
    return NextResponse.json({ status: "logged-error" }, { status: 202 });
  }

  await pauseSequenceForTask(admin, matched.orgId, matched.taskCode, "inbound reply").catch(() => {});

  // Attachments (list → download → store) after the 200, logging failures.
  if (emailId) {
    after(async () => {
      await storeAttachments(admin, {
        emailId,
        rowId: row.id,
        orgId: matched!.orgId,
        taskCode: matched!.taskCode,
      });
    });
  }

  return NextResponse.json({ status: "ok", emailId: row.id });
}

async function storeAttachments(
  admin: ReturnType<typeof createAdminClient>,
  opts: { emailId: string; rowId: string; orgId: string; taskCode: string },
) {
  let list: Awaited<ReturnType<typeof listReceivedAttachments>>;
  try {
    list = await listReceivedAttachments(opts.emailId);
  } catch (err) {
    console.error("[inbound] attachment list failed:", (err as Error).message);
    await logAttachmentFailure(admin, opts, `list failed: ${(err as Error).message}`);
    return;
  }

  for (const att of list) {
    try {
      const bytes = await downloadAttachment(att.download_url);
      if (!bytes) {
        await logAttachmentFailure(admin, opts, `download failed: ${att.filename}`);
        continue;
      }
      const check = attachmentAllowed(att.content_type, bytes.byteLength);
      if (!check.ok) {
        await logAttachmentFailure(admin, opts, `rejected ${att.filename}: ${check.reason}`);
        continue;
      }
      await storeEmailAttachment(admin, {
        emailId: opts.rowId,
        orgId: opts.orgId,
        taskCode: opts.taskCode,
        filename: att.filename,
        contentType: att.content_type,
        bytes,
      });
    } catch (err) {
      console.error("[inbound] attachment store failed:", (err as Error).message);
      await logAttachmentFailure(admin, opts, `store failed ${att.filename}: ${(err as Error).message}`);
    }
  }
}

async function logAttachmentFailure(
  admin: ReturnType<typeof createAdminClient>,
  opts: { taskCode: string; orgId: string },
  detail: string,
) {
  // Visible, not swallowed: lands in the superadmin /dashboard/admin/unmatched view.
  await admin
    .from("inbound_unmatched")
    .insert({
      to_email: opts.taskCode,
      from_email: null,
      subject: "attachment failed",
      reason: `attachment-failed: ${detail}`,
      raw: null,
    })
    .then(() => {}, () => {});
}

// ---- helpers ----

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

function extractEmail(v: unknown): string | null {
  if (typeof v === "string") {
    const m = v.match(/<([^>]+)>/);
    return (m ? m[1] : v).trim().toLowerCase();
  }
  if (v && typeof v === "object") {
    const e = (v as { email?: string }).email;
    if (typeof e === "string") return e.trim().toLowerCase();
  }
  return null;
}

function extractRecipients(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const e = extractEmail(v);
    if (e) out.push(e);
  };
  for (const key of ["to", "cc"]) {
    const v = data[key];
    if (Array.isArray(v)) v.forEach(push);
    else if (v) push(v);
  }
  return out;
}
