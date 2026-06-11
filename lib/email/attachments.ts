import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared attachment rules + storage for BOTH inbound and outbound task email.
// One allowlist + size cap, applied either way.
export const ATTACHMENT_BUCKET = "task-email-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB each
export const MAX_ATTACHMENTS = 10; // per message

export const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export function attachmentAllowed(
  contentType: string | null | undefined,
  size: number,
): { ok: true } | { ok: false; reason: string } {
  if (size <= 0) return { ok: false, reason: "empty file" };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "exceeds 10MB" };
  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME.has(ct)) return { ok: false, reason: `type "${ct || "unknown"}" not allowed` };
  return { ok: true };
}

export function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return safe || "attachment";
}

export type OutAttachment = {
  filename: string;
  contentType: string | null;
  bytes: Buffer;
};

// Upload one attachment to the private bucket under the owning email's path and
// record it in task_email_attachments. Returns the storage path, or null on
// failure (best-effort; callers continue with the rest).
export async function storeEmailAttachment(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    emailId: string;
    orgId: string;
    taskCode: string;
    filename: string;
    contentType: string | null;
    bytes: Buffer;
  },
): Promise<string | null> {
  const safe = sanitizeFilename(opts.filename);
  // path = {org_id}/{task_code}/{email_id}/{filename} — org-scoped for the
  // storage RLS read policy and signed URLs.
  const path = `${opts.orgId}/${opts.taskCode}/${opts.emailId}/${safe}`;
  const { error: upErr } = await admin.storage.from(ATTACHMENT_BUCKET).upload(path, opts.bytes, {
    contentType: opts.contentType ?? "application/octet-stream",
    upsert: true,
  });
  if (upErr) return null;

  await admin.from("task_email_attachments").insert({
    email_id: opts.emailId,
    org_id: opts.orgId,
    filename: opts.filename,
    content_type: opts.contentType,
    size_bytes: opts.bytes.byteLength,
    storage_path: path,
  });
  return path;
}
