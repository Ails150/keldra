import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseThreadAddress } from "@/lib/email/task-email";
import { verifyResendWebhook } from "@/lib/email/svix";
import { stripQuotedReply } from "@/lib/email/strip-quote";
import { attachmentAllowed, storeEmailAttachment } from "@/lib/email/attachments";
import { pauseSequenceForTask } from "@/lib/sequences/engine";

// Resend inbound webhook (email.received). Order of operations:
//  1. Verify the Svix signature — reject anything unsigned.
//  2. Match the To-address to a thread (+ token). No match → 202 + dead-letter.
//  3. Insert the inbound message fast, return 200.
//  4. Fetch + store attachments AFTER responding (after()).
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
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const data = (event.data ?? event) as Record<string, unknown>;
  const recipients = extractRecipients(data);
  const fromEmail = extractEmail(data.from) ?? "";
  const subject = typeof data.subject === "string" ? data.subject : "";
  const text = typeof data.text === "string" ? data.text : "";
  const html = typeof data.html === "string" ? data.html : "";
  const { messageId, inReplyTo } = extractMessageIds(data.headers);

  const admin = createAdminClient();

  // Find the first recipient that resolves to a real thread with a matching token.
  let matched: { threadId: string; orgId: string; taskCode: string; to: string } | null =
    null;
  for (const addr of recipients) {
    const parsed = parseThreadAddress(addr);
    if (!parsed) continue;
    const { data: thread } = await admin
      .from("task_threads")
      .select("id, org_id, task_code, email_token")
      .eq("id", parsed.threadId)
      .maybeSingle<{ id: string; org_id: string; task_code: string; email_token: string }>();
    // Unknown thread or tampered token → keep looking, then dead-letter.
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
    // Acknowledge so Resend doesn't retry; nothing silently disappears.
    return NextResponse.json({ status: "unmatched" }, { status: 202 });
  }

  const cleanText = stripQuotedReply(text) || (html ? "" : "(no message body)");

  // Attribute to a known user if the sender matches one.
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
      body_html: html || null,
      message_id: messageId,
      in_reply_to: inReplyTo,
      actor_user_id: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !row) {
    // Don't lose it — record as unmatched-with-reason for the admin view.
    await admin.from("inbound_unmatched").insert({
      to_email: matched.to,
      from_email: fromEmail,
      subject,
      reason: `insert failed: ${error?.message ?? "unknown"}`,
      raw: event as never,
    });
    return NextResponse.json({ status: "logged-error" }, { status: 202 });
  }

  // An inbound reply pauses any active chase sequence on this task.
  await pauseSequenceForTask(admin, matched.orgId, matched.taskCode, "inbound reply").catch(
    () => {},
  );

  // Heavy lifting (attachment download + upload) happens after the 200.
  const attachments = extractAttachments(data);
  if (attachments.length > 0) {
    after(async () => {
      await storeAttachments(admin, {
        emailId: row.id,
        orgId: matched!.orgId,
        taskCode: matched!.taskCode,
        attachments,
      });
    });
  }

  return NextResponse.json({ status: "ok", emailId: row.id });
}

// ---- payload extraction (defensive — Resend shapes vary) --------------------

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

function extractMessageIds(headers: unknown): {
  messageId: string | null;
  inReplyTo: string | null;
} {
  let messageId: string | null = null;
  let inReplyTo: string | null = null;
  const set = (name: string, value: string) => {
    const n = name.toLowerCase();
    if (n === "message-id") messageId = value;
    if (n === "in-reply-to") inReplyTo = value;
  };
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === "object") {
        const name = (h as { name?: string }).name;
        const value = (h as { value?: string }).value;
        if (name && typeof value === "string") set(name, value);
      }
    }
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string") set(k, v);
    }
  }
  return { messageId, inReplyTo };
}

type RawAttachment = {
  filename: string;
  contentType: string | null;
  content?: string; // base64
  url?: string;
};

function extractAttachments(data: Record<string, unknown>): RawAttachment[] {
  const list = data.attachments;
  if (!Array.isArray(list)) return [];
  return list
    .map((a): RawAttachment | null => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      const filename =
        (typeof o.filename === "string" && o.filename) ||
        (typeof o.name === "string" && o.name) ||
        "attachment";
      const contentType =
        (typeof o.content_type === "string" && o.content_type) ||
        (typeof o.contentType === "string" && o.contentType) ||
        null;
      const content = typeof o.content === "string" ? o.content : undefined;
      const url =
        (typeof o.url === "string" && o.url) ||
        (typeof o.download_url === "string" && o.download_url) ||
        undefined;
      if (!content && !url) return null;
      return { filename, contentType, content, url };
    })
    .filter((a): a is RawAttachment => a !== null);
}

async function storeAttachments(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    emailId: string;
    orgId: string;
    taskCode: string;
    attachments: RawAttachment[];
  },
) {
  for (const att of opts.attachments) {
    try {
      let bytes: Buffer | null = null;
      if (att.content) {
        bytes = Buffer.from(att.content, "base64");
      } else if (att.url) {
        const res = await fetch(att.url, {
          headers: process.env.RESEND_API_KEY
            ? { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
            : undefined,
        });
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
      }
      if (!bytes) continue;

      // Same allowlist + 10MB cap as outbound. Disallowed/oversized inbound
      // files are skipped (we already accepted the email itself).
      if (!attachmentAllowed(att.contentType, bytes.byteLength).ok) continue;

      await storeEmailAttachment(admin, {
        emailId: opts.emailId,
        orgId: opts.orgId,
        taskCode: opts.taskCode,
        filename: att.filename,
        contentType: att.contentType,
        bytes,
      });
    } catch {
      // best-effort per attachment; one bad file shouldn't drop the rest.
    }
  }
}
