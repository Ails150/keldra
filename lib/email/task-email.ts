import "server-only";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeEmailAttachment, type OutAttachment } from "@/lib/email/attachments";

// reply.keldra.io is the ONLY Resend-verified domain (sending + receiving).
// We both send FROM and receive replies AT the per-thread address on this
// domain — no separate from/reply-to, which also threads cleanly in Outlook.
export const REPLY_DOMAIN = "reply.keldra.io";

// ---- thread address encode / decode -----------------------------------------
// Local part = task-{threadHex}-{token}, all hex so it parses cleanly even
// though task codes contain hyphens. threadHex = thread UUID without hyphens.

function uuidToHex(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function hexToUuid(hex: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

// The per-thread address: we send FROM it and replies come back TO it.
export function buildThreadAddress(threadId: string, token: string): string {
  return `task-${uuidToHex(threadId)}-${token}@${REPLY_DOMAIN}`;
}

// Pull the threadId + token out of a "To" address (which may be in
// "Name <addr>" form, and may carry other recipients — caller passes one addr).
export function parseThreadAddress(
  raw: string,
): { threadId: string; token: string } | null {
  const angle = raw.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : raw).trim().toLowerCase();
  const local = addr.split("@")[0];
  const m = local.match(/^task-([0-9a-f]{32})-([0-9a-f]+)$/);
  if (!m) return null;
  const threadId = hexToUuid(m[1]);
  if (!threadId) return null;
  return { threadId, token: m[2] };
}

// ---- thread lifecycle -------------------------------------------------------

type Thread = { id: string; email_token: string };

// Get-or-create the thread for (org, task). email_token is generated on first
// send and stays stable for the life of the thread.
export async function ensureThread(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  taskCode: string,
): Promise<Thread> {
  const { data: existing } = await admin
    .from("task_threads")
    .select("id, email_token")
    .eq("org_id", orgId)
    .eq("task_code", taskCode)
    .maybeSingle<Thread>();
  if (existing) return existing;

  const token = randomBytes(8).toString("hex"); // 16 hex chars
  const { data, error } = await admin
    .from("task_threads")
    .insert({ org_id: orgId, task_code: taskCode, email_token: token })
    .select("id, email_token")
    .single<Thread>();

  // Lost a race to a concurrent first-send? Re-read the winner.
  if (error || !data) {
    const { data: raced } = await admin
      .from("task_threads")
      .select("id, email_token")
      .eq("org_id", orgId)
      .eq("task_code", taskCode)
      .maybeSingle<Thread>();
    if (raced) return raced;
    throw new Error(error?.message ?? "Couldn't open an email thread.");
  }
  return data;
}

// ---- send -------------------------------------------------------------------

export type SendResult = {
  emailId: string; // task_emails row id
  resendId: string | null;
};

// Send a task email with a threadable reply-to, and log it to task_emails (the
// row that renders in the task Activity trail). Subject is prefixed with the
// task code, e.g. "[ELE-COLO-1030] ...".
export async function sendTaskEmail(opts: {
  orgId: string;
  taskCode: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: OutAttachment[];
  actorUserId?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY. Add it to .env.local (local) AND Netlify env vars (production).",
    );
  }

  const admin = createAdminClient();
  const thread = await ensureThread(admin, opts.orgId, opts.taskCode);
  // The thread address is BOTH the From and where replies return — no reply_to.
  const threadAddress = buildThreadAddress(thread.id, thread.email_token);
  const from = `"Keldra · ${opts.taskCode}" <${threadAddress}>`;
  const subject = opts.subject.startsWith(`[${opts.taskCode}]`)
    ? opts.subject
    : `[${opts.taskCode}] ${opts.subject}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.attachments && opts.attachments.length
        ? {
            attachments: opts.attachments.map((a) => ({
              filename: a.filename,
              content: a.bytes.toString("base64"),
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(payload.message ?? `Resend send failed (${res.status}).`);
  }
  const resendId = payload.id ?? null;

  const { data: row, error } = await admin
    .from("task_emails")
    .insert({
      thread_id: thread.id,
      org_id: opts.orgId,
      task_code: opts.taskCode,
      direction: "outbound",
      from_email: threadAddress,
      to_email: opts.to,
      subject,
      body_html: opts.html,
      body_text: opts.text ?? null,
      resend_email_id: resendId,
      actor_user_id: opts.actorUserId ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !row) {
    // The mail went out; surface the logging failure but don't pretend it didn't send.
    throw new Error(
      `Email sent but logging failed: ${error?.message ?? "unknown error"}`,
    );
  }

  // Persist each sent attachment to the private bucket + task_email_attachments
  // so it renders on the trail (audit log of exactly what went out, with files).
  for (const att of opts.attachments ?? []) {
    await storeEmailAttachment(admin, {
      emailId: row.id,
      orgId: opts.orgId,
      taskCode: opts.taskCode,
      filename: att.filename,
      contentType: att.contentType,
      bytes: att.bytes,
    });
  }

  return { emailId: row.id, resendId };
}
