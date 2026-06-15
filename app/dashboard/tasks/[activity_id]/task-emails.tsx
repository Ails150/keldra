"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import type { Activity } from "@/lib/activity";

const BUCKET = "task-email-attachments";

// Mirror of the server allowlist + 10MB cap, for a friendly client-side check.
const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// A piece of existing trail evidence (a field-capture photo) that can be
// re-attached to an outgoing email in one tick.
export type EvidenceItem = { id: string; name: string; thumbUrl: string | null };

type AttachmentRow = {
  id: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string;
};

type EmailRow = {
  id: string;
  direction: "outbound" | "inbound";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  created_at: string;
  actor_user_id: string | null;
  task_email_attachments: AttachmentRow[] | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function toActivity(
  supabase: ReturnType<typeof createClient>,
  row: EmailRow,
): Promise<Activity> {
  const actorName =
    row.direction === "inbound"
      ? row.from_email || "External sender"
      : `You → ${row.to_email ?? ""}`.trim();

  const body =
    row.body_text?.trim() ||
    (row.body_html ? stripHtml(row.body_html) : "") ||
    "(no message body)";

  // Mint short-lived signed URLs for each attachment (storage RLS scopes these
  // to the caller's org).
  const atts = await Promise.all(
    (row.task_email_attachments ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(a.storage_path, 60 * 60);
      return { name: a.filename ?? "attachment", url: data?.signedUrl ?? "#" };
    }),
  );

  return {
    id: `email-${row.id}`,
    task_id: "",
    project_id: "mer",
    type: row.direction === "outbound" ? "chase" : "response",
    direction: row.direction,
    channel: "email",
    actor: { name: actorName, company_slug: "", role: "Email" },
    recipient: null,
    subject: row.subject,
    body,
    attachments: [],
    metadata: { via_email: true, email_attachments: atts },
    created_at: row.created_at,
    created_by: actorName,
  };
}

// Loads the task's email thread (org-scoped by RLS) and tells the page whether
// the current user can send (i.e. is signed in to an org). Demo/anon visitors
// get canEmail=false and an empty thread, so the public demo is untouched.
export function useTaskEmails(taskCode: string) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [canEmail, setCanEmail] = useState(false);

  const reload = useCallback(async () => {
    if (!taskCode) return;
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("org_id, role")
          .eq("id", user.id)
          .maybeSingle();
        // Org members can send, except read-only viewers and field users.
        const role = (profile?.role as string | null) ?? null;
        setCanEmail(!!profile?.org_id && role !== "viewer" && role !== "field");
      } else {
        setCanEmail(false);
      }

      const { data, error } = await supabase
        .from("task_emails")
        .select(
          "id, direction, from_email, to_email, subject, body_text, body_html, created_at, actor_user_id, task_email_attachments(id, filename, content_type, size_bytes, storage_path)",
        )
        .eq("task_code", taskCode)
        .order("created_at", { ascending: true });

      if (error || !data) {
        setActivities([]);
        return;
      }
      const mapped = await Promise.all(
        (data as EmailRow[]).map((r) => toActivity(supabase, r)),
      );
      setActivities(mapped);
    } catch {
      setActivities([]);
    }
  }, [taskCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { activities, canEmail, reload };
}

export function EmailUpdateModal({
  taskCode,
  evidence = [],
  onClose,
  onSent,
}: {
  taskCode: string;
  evidence?: EvidenceItem[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Status update requested");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contacts, setContacts] = useState<{ email: string; name: string | null; company: string | null }[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/tasks/contacts?taskCode=${encodeURIComponent(taskCode)}`);
      if (res.ok) setContacts(((await res.json()) as { contacts?: typeof contacts }).contacts ?? []);
    })();
  }, [taskCode]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" is over 10MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles((cur) => [...cur, ...next]);
  }

  function toggleEvidence(id: string) {
    setSelectedEvidence((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("taskCode", taskCode);
    fd.set("to", to);
    fd.set("contactName", name);
    fd.set("contactCompany", company);
    fd.set("subject", subject);
    fd.set("message", message);
    fd.set("evidence", JSON.stringify([...selectedEvidence]));
    for (const f of files) fd.append("files", f);

    // No Content-Type header — the browser sets the multipart boundary.
    const res = await fetch("/api/tasks/email", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send the email.");
      return;
    }
    onSent();
    onClose();
  }

  const input =
    "w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-2xl bg-paper-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 20 }}
        >
          Email update
        </h2>
        <p className="text-[12px] italic text-ink-mid">
          {taskCode} · the reply lands back on this task&apos;s trail
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Recipient email (anyone — they don't need Keldra)"
            className={input}
          />
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => {
                    setTo(c.email);
                    if (c.name) setName(c.name);
                    if (c.company) setCompany(c.company);
                  }}
                  className="rounded-full border border-paper-line px-2.5 py-1 text-[11px] text-ink hover:border-accent"
                >
                  {c.name || c.email}
                  {c.company ? ` · ${c.company}` : ""}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className={input}
            />
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company (optional)"
              className={input}
            />
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={input}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Ask for a status update…"
            className={input}
          />

          {/* Attach existing trail evidence (field-capture photos) */}
          {evidence.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Attach evidence from this task
              </p>
              <div className="flex flex-wrap gap-2">
                {evidence.map((ev) => {
                  const on = selectedEvidence.has(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggleEvidence(ev.id)}
                      title={ev.name}
                      className="relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors"
                      style={{ borderColor: on ? BRAND.purple : BRAND.border }}
                    >
                      {ev.thumbUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={ev.thumbUrl} alt={ev.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-ink-mid">
                          photo
                        </span>
                      )}
                      {on && (
                        <span
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-paper"
                          style={{ backgroundColor: BRAND.purple }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload new files */}
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-paper-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent">
              📎 Add files
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="ml-2 text-[11px] text-ink-mid">
              images, PDF, docs · 10MB each
            </span>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md border border-paper-line px-2 py-1 text-[11px] text-ink"
                  >
                    <span className="truncate">
                      📎 {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                      className="ml-2 flex-shrink-0 text-ink-mid hover:text-red-600"
                      aria-label={`Remove ${f.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-paper-line px-4 py-2 text-sm text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !to.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60"
            style={{ backgroundColor: BRAND.purple }}
          >
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}
