"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import type { Activity } from "@/lib/activity";

const BUCKET = "task-email-attachments";

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
          .select("org_id")
          .eq("id", user.id)
          .maybeSingle();
        setCanEmail(!!profile?.org_id);
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
  onClose,
  onSent,
}: {
  taskCode: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Status update requested");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/tasks/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskCode, to, subject, message }),
    });
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
            placeholder="Recipient email"
            className={input}
          />
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
            rows={5}
            placeholder="Ask for a status update…"
            className={input}
          />
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
