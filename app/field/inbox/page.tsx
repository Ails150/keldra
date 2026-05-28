"use client";

import { useEffect, useMemo, useState } from "react";
import { type Activity, logActivity } from "@/lib/activity";
import {
  PERSONA_ACTOR,
  PM,
  daysAgo,
  inboxMessages,
  type Inbox,
} from "../field-persona";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const CHANNEL: Record<string, string> = {
  email: "Email",
  call: "Call",
  whatsapp: "WhatsApp",
  site_visit: "Site visit",
  in_person: "In person",
  keldra: "Keldra",
};

export default function FieldInbox() {
  const [inbox, setInbox] = useState<Inbox>({ regular: [], formal: null });
  const [repliedIds, setRepliedIds] = useState<Set<string>>(new Set());
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [escalationOpened, setEscalationOpened] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setInbox(inboxMessages());
  }, []);

  // The 2 most recent chases count as unread until replied.
  const newIds = useMemo(
    () => new Set(inbox.regular.slice(0, 2).map((m) => m.id)),
    [inbox.regular],
  );
  const newCount = inbox.regular
    .slice(0, 2)
    .filter((m) => !repliedIds.has(m.id)).length;

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }

  function send(m: Activity) {
    const text = replyText.trim();
    if (!text) return;
    logActivity({
      task_id: m.task_id,
      type: "response",
      direction: "inbound",
      channel: "keldra",
      actor: PERSONA_ACTOR,
      recipient: PM,
      subject: m.subject ? `RE: ${m.subject}` : null,
      body: text,
    });
    setRepliedIds((prev) => new Set(prev).add(m.id));
    setReplyingId(null);
    setReplyText("");
    showToast(`Reply sent — logged to ${m.task_id}`);
  }

  const { regular, formal } = inbox;

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Messages
        </h1>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent-deep">
          {newCount} NEW
        </span>
      </header>

      <p className="text-xs text-ink-mid">
        Every chase and reply lives here, in Keldra — not lost in WhatsApp.
      </p>

      {/* Formal escalation — urgent, unopened */}
      {formal && (
        <div
          className={`rounded-2xl border-2 p-4 ${
            escalationOpened
              ? "border-paper-line bg-paper-card"
              : "border-red-300 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden>
              ⚠
            </span>
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">
              Formal escalation
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">
            From {formal.actor.name} · {daysAgo(formal.created_at)} days ago
          </p>
          {!escalationOpened ? (
            <>
              <p className="mt-1 text-sm font-semibold text-red-700">
                You haven&apos;t opened this.
              </p>
              <button
                type="button"
                onClick={() => setEscalationOpened(true)}
                className="mt-3 min-h-[44px] w-full rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
              >
                Open &amp; acknowledge
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ink">{formal.body}</p>
              <p className="mt-2 text-xs font-medium text-ink-mid">
                ✓ Opened just now · {formal.task_id}
              </p>
              <button
                type="button"
                onClick={() => {
                  setReplyingId(formal.id);
                  setReplyText("");
                }}
                className="mt-3 min-h-[44px] w-full rounded-xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10"
              >
                Reply
              </button>
              {replyingId === formal.id && (
                <ReplyBox
                  value={replyText}
                  onChange={setReplyText}
                  onSend={() => send(formal)}
                  onCancel={() => {
                    setReplyingId(null);
                    setReplyText("");
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Regular chases */}
      <ul className="space-y-3">
        {regular.map((m) => {
          const isNew = newIds.has(m.id) && !repliedIds.has(m.id);
          const replied = repliedIds.has(m.id);
          return (
            <li
              key={m.id}
              className="rounded-2xl border border-paper-line bg-paper-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{m.actor.name}</p>
                <div className="flex items-center gap-2">
                  {isNew && (
                    <span className="rounded-full bg-accent-deep px-1.5 py-0.5 text-[10px] font-bold text-paper">
                      NEW
                    </span>
                  )}
                  <span className="text-xs text-ink-mid">{fmtDate(m.created_at)}</span>
                </div>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink-mid">{m.task_id}</span>
                {m.channel && CHANNEL[m.channel] && (
                  <span className="rounded-full bg-paper-warm px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-mid">
                    {CHANNEL[m.channel]}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink">{m.body}</p>

              {replied ? (
                <p className="mt-3 text-xs font-medium text-teal-700">
                  ✓ Replied — logged to {m.task_id}
                </p>
              ) : replyingId === m.id ? (
                <ReplyBox
                  value={replyText}
                  onChange={setReplyText}
                  onSend={() => send(m)}
                  onCancel={() => {
                    setReplyingId(null);
                    setReplyText("");
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingId(m.id);
                    setReplyText("");
                  }}
                  className="mt-3 min-h-[44px] w-full rounded-xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10"
                >
                  Reply
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-center text-sm font-medium text-paper shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ReplyBox({
  value,
  onChange,
  onSend,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your reply…"
        rows={3}
        autoFocus
        className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          className="min-h-[44px] flex-1 rounded-xl bg-accent-deep text-sm font-semibold text-paper active:bg-accent disabled:opacity-60"
        >
          Send reply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border-2 border-paper-line px-5 text-sm font-semibold text-ink active:bg-paper-warm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
