"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { type Activity, type ActivityType, logActivity } from "@/lib/activity";
import { loadBaseline } from "./lib/baseline-seed";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h ago`;
  return "just now";
}
function absTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dirColour(e: Activity): string {
  if (e.type === "system") return BRAND.warningInk;
  if (e.direction === "outbound") return BRAND.purple;
  if (e.direction === "inbound") return BRAND.successInk;
  return BRAND.inkMuted;
}

function TypeIcon({ type, colour }: { type: ActivityType; colour: string }) {
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none",
    stroke: colour, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "chase":
      return <svg {...common}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>;
    case "response":
      return <svg {...common}><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></svg>;
    case "status_change":
      return <svg {...common}><path d="M7 10h12l-3-3" /><path d="M17 14H5l3 3" /></svg>;
    case "note":
      return <svg {...common}><path d="M9 4v6l-2 4h10l-2-4V4" /><line x1="12" y1="18" x2="12" y2="21" /></svg>;
    case "cost_change":
      return <svg {...common}><path d="M16 7H10a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6H7" /><line x1="8" y1="13" x2="14" y2="13" /></svg>;
    default:
      return <svg {...common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
  }
}

export function ActivityTimeline({
  entries,
  taskLabel,
  onTaskClick,
}: {
  entries: Activity[];
  taskLabel?: (id: string) => string;
  onTaskClick?: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-ink-mid">No activity logged yet.</p>
    );
  }
  return (
    <ul>
      {entries.map((e, i) => {
        const colour = dirColour(e);
        const last = i === entries.length - 1;
        return (
          <li key={e.id} className="flex gap-3 px-5 py-3.5" style={{ borderBottom: last ? "none" : `0.5px solid ${BRAND.border}` }}>
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${colour}1a` }}
              >
                <TypeIcon type={e.type} colour={colour} />
              </span>
              {!last && <span className="mt-1 w-px flex-1" style={{ backgroundColor: BRAND.border }} />}
            </div>

            <div className="min-w-0 flex-1">
              {taskLabel && (
                <button
                  type="button"
                  onClick={() => onTaskClick?.(e.task_id)}
                  className="mb-1 inline-block rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink hover:bg-paper-line"
                >
                  {taskLabel(e.task_id)}
                </button>
              )}

              {e.type === "system" ? (
                <p className="text-[12px] italic text-ink-mid">
                  {e.body}{" "}
                  <span className="font-mono">· {relTime(e.created_at)}</span>
                </p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] text-ink">
                      <span className="font-medium">{e.actor.name}</span>
                    </span>
                    <span
                      className="flex-shrink-0 font-mono text-[11px] text-ink-mid"
                      title={absTime(e.created_at)}
                    >
                      {relTime(e.created_at)}
                    </span>
                  </div>
                  {e.subject && (
                    <p className="mt-0.5 text-[13px] font-medium text-ink">{e.subject}</p>
                  )}
                  <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">
                    {e.body}
                  </p>
                  {e.metadata.photo_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={e.metadata.photo_url}
                      alt="Logged photo evidence"
                      style={{ marginTop: 8, display: "block", maxHeight: 200, borderRadius: 8, border: `0.5px solid ${BRAND.border}` }}
                    />
                  )}

                  {e.type === "status_change" && e.metadata.new_status && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                      <Pill>{e.metadata.old_status ?? "—"}</Pill>
                      <span style={{ color: BRAND.inkMuted }}>→</span>
                      <Pill>{e.metadata.new_status}</Pill>
                    </div>
                  )}

                  {e.type === "cost_change" && (
                    <>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: BRAND.warningInk }}>
                        <Pill warn>{GBP.format(e.metadata.old_cost ?? 0)}/day</Pill>
                        <span>→</span>
                        <Pill warn>{GBP.format(e.metadata.new_cost ?? 0)}/day</Pill>
                      </div>
                      {e.metadata.cost_change_reason && (
                        <p className="mt-1 text-[12px] italic text-ink-mid">
                          Reason: {e.metadata.cost_change_reason}
                        </p>
                      )}
                    </>
                  )}

                  {e.channel && e.channel !== "keldra" && e.channel !== "system" && (
                    <span
                      className="mt-2 inline-block rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] text-ink-mid"
                      style={{ backgroundColor: BRAND.cream }}
                    >
                      {e.channel.replace("_", " ").toUpperCase()} · {timeOnly(e.created_at)}
                    </span>
                  )}

                  {e.attachments.map((a) => (
                    <button
                      key={a.name}
                      type="button"
                      className="mt-2 block rounded-md border border-paper-line px-2 py-1 text-left font-mono text-[11px] text-ink-mid hover:bg-paper-warm"
                    >
                      📎 {a.name} · {(a.size_kb / 1024).toFixed(1)} MB
                    </button>
                  ))}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Pill({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={
        warn
          ? { backgroundColor: BRAND.warningBg, color: BRAND.warningInk }
          : { backgroundColor: BRAND.cream, color: BRAND.ink }
      }
    >
      {children}
    </span>
  );
}

// ---------- Log modal ----------

const TYPES: { id: ActivityType; label: string }[] = [
  { id: "chase", label: "Chase" },
  { id: "response", label: "Response" },
  { id: "note", label: "Note" },
  { id: "status_change", label: "Status" },
  { id: "cost_change", label: "Cost" },
];

const CHANNELS = ["email", "call", "whatsapp", "site_visit", "in_person"] as const;

export function LogActivityModal({
  taskId,
  taskName,
  currentStatus,
  currentCost,
  onClose,
  onLogged,
}: {
  taskId: string;
  taskName: string;
  currentStatus: string;
  currentCost: number;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [type, setType] = useState<ActivityType>("chase");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [newCost, setNewCost] = useState(String(currentCost));
  const [reason, setReason] = useState("");
  const [emailHelp, setEmailHelp] = useState(false);

  const people = loadBaseline().companies.map((c) => c.name);

  function submit() {
    if (type === "note" && !body.trim()) return;
    if ((type === "chase" || type === "response") && !body.trim()) return;
    if ((type === "status_change" || type === "cost_change") && !reason.trim()) return;

    const direction = type === "chase" ? "outbound" : type === "response" ? "inbound" : "internal";
    logActivity({
      task_id: taskId,
      type,
      direction,
      channel: type === "chase" || type === "response" ? channel : "keldra",
      subject: subject || null,
      body:
        type === "status_change"
          ? reason
          : type === "cost_change"
            ? reason
            : body,
      recipient: type === "chase" && recipient ? { name: recipient, company_slug: "" } : null,
      metadata:
        type === "status_change"
          ? { old_status: currentStatus, new_status: newStatus }
          : type === "cost_change"
            ? { old_cost: currentCost, new_cost: Number(newCost) || 0, cost_change_reason: reason }
            : {},
    });
    onLogged();
    onClose();
  }

  const input = "w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-2xl bg-paper-card p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 20 }}>
          Log activity
        </h2>
        <p className="text-[12px] italic text-ink-mid">
          {taskId} · {taskName}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className="rounded px-3.5 py-1.5 text-xs font-medium"
              style={
                type === t.id
                  ? { backgroundColor: BRAND.ink, color: BRAND.cream }
                  : { backgroundColor: BRAND.cream, color: BRAND.inkMuted }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {(type === "chase" || type === "response") && (
            <>
              <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className={input}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
              {type === "chase" && (
                <select value={recipient} onChange={(e) => setRecipient(e.target.value)} className={input}>
                  <option value="">Recipient…</option>
                  {people.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)" className={input} />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What happened?" className={input} />
            </>
          )}
          {type === "note" && (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Internal note" className={input} />
          )}
          {type === "status_change" && (
            <>
              <p className="text-xs text-ink-mid">Current: {currentStatus}</p>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={input}>
                {["Blocked", "on_track", "not_started_should_be", "complete"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason (required)" className={input} />
            </>
          )}
          {type === "cost_change" && (
            <>
              <p className="text-xs text-ink-mid">Current: {GBP.format(currentCost)}/day</p>
              <input type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="New £/day" className={input} />
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason (required)" className={input} />
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={() => setEmailHelp(true)} className="text-[11px] text-accent hover:text-accent-deep">
            Import from email →
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-paper-line px-4 py-2 text-sm text-ink">
              Cancel
            </button>
            <button type="button" onClick={submit} className="rounded-lg px-4 py-2 text-sm font-semibold text-paper" style={{ backgroundColor: BRAND.purple }}>
              Log activity
            </button>
          </div>
        </div>

        {emailHelp && (
          <div className="mt-4 rounded-xl border border-paper-line bg-paper-warm/50 p-3 text-[12px] text-ink-mid">
            Email import — coming during pilot. Forward emails to{" "}
            <span className="font-mono text-ink">trail@keldra.io</span> and they&apos;ll
            attach to the right task by activity_id match.
            <button type="button" onClick={() => setEmailHelp(false)} className="ml-2 text-accent">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm text-paper shadow-lg"
      style={{ backgroundColor: BRAND.ink }}
    >
      {message}
    </div>
  );
}
