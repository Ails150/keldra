import "server-only";

// Resend inbound webhooks are METADATA ONLY — no body, no attachment content.
// The body + attachments must be fetched from the Received Emails API using the
// email_id from the webhook. https://resend.com/docs/dashboard/receiving

const BASE = "https://api.resend.com/emails/receiving";

export type ReceivedEmail = {
  text: string | null;
  html: string | null;
  subject?: string;
  from?: string;
  to?: string[];
  message_id?: string;
};

export type ReceivedAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  download_url: string;
};

function key(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

// GET the full received email (text/html) by id. Throws on a failed fetch so the
// caller can log it visibly instead of silently rendering an empty body.
export async function getReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const apiKey = key();
  if (!apiKey) throw new Error("RESEND_API_KEY missing — cannot fetch inbound body");
  const res = await fetch(`${BASE}/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`receiving.get ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as ReceivedEmail;
}

// List attachment metadata (each carries a signed download_url for the bytes).
export async function listReceivedAttachments(emailId: string): Promise<ReceivedAttachment[]> {
  const apiKey = key();
  if (!apiKey) throw new Error("RESEND_API_KEY missing — cannot list inbound attachments");
  const res = await fetch(`${BASE}/${encodeURIComponent(emailId)}/attachments`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`receiving attachments ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: ReceivedAttachment[] };
  return json.data ?? [];
}

// Download attachment bytes from its signed URL (no auth header — it's signed).
export async function downloadAttachment(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
