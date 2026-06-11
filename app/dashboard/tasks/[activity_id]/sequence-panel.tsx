"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

type Sequence = {
  id: string;
  status: "active" | "paused" | "completed" | "stopped";
  current_step: number;
  total_steps: number;
  to_email: string;
  next_run_at: string | null;
  escalation_contact: string | null;
};

function fmtNext(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SequencePanel({
  taskCode,
  canManage,
}: {
  taskCode: string;
  canManage: boolean;
}) {
  const [seq, setSeq] = useState<Sequence | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [escalation, setEscalation] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSeq(null);
        return;
      }
      const { data } = await supabase
        .from("task_sequences")
        .select("id,status,current_step,total_steps,to_email,next_run_at,escalation_contact")
        .eq("task_code", taskCode)
        .maybeSingle();
      setSeq((data as Sequence) ?? null);
    } catch {
      setSeq(null);
    }
  }, [taskCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function control(action: "pause" | "resume" | "stop") {
    if (!seq) return;
    await fetch("/api/sequences/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: seq.id, action }),
    });
    void load();
  }

  async function start() {
    setStarting(true);
    setError(null);
    const res = await fetch("/api/sequences/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskCode,
        to,
        deadline: deadline || undefined,
        escalationContact: escalation || undefined,
        commitmentQuote: quote || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setStarting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't start the sequence.");
      return;
    }
    setOpen(false);
    setTo("");
    setDeadline("");
    setEscalation("");
    setQuote("");
    void load();
  }

  if (seq === undefined) return null; // loading
  if (!canManage && !seq) return null; // nothing to show for read-only/anon

  const input =
    "w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div
      style={{
        border: `0.5px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        backgroundColor: "#faf6ff",
      }}
    >
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.purple,
          fontWeight: 600,
        }}
      >
        Chase sequence
      </p>

      {seq ? (
        <>
          <p className="mt-1.5 text-sm text-ink">
            <span className="font-medium">
              Step {Math.min(seq.current_step + 1, seq.total_steps)} of {seq.total_steps}
            </span>
            {seq.status === "active" && (
              <>
                {" "}· next {fmtNext(seq.next_run_at)} ·{" "}
                <span className="text-ink-mid">pauses on reply</span>
              </>
            )}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor:
                  seq.status === "active"
                    ? BRAND.successBg
                    : seq.status === "paused"
                      ? BRAND.warningBg
                      : BRAND.paperWarm,
                color:
                  seq.status === "active"
                    ? BRAND.successInk
                    : seq.status === "paused"
                      ? BRAND.warningInk
                      : BRAND.inkMuted,
              }}
            >
              {seq.status}
            </span>
            {canManage && seq.status === "active" && (
              <button type="button" onClick={() => control("pause")} className="text-[12px] text-accent hover:text-accent-deep">
                Pause
              </button>
            )}
            {canManage && seq.status === "paused" && (
              <button type="button" onClick={() => control("resume")} className="text-[12px] text-accent hover:text-accent-deep">
                Resume
              </button>
            )}
            {canManage && (seq.status === "active" || seq.status === "paused") && (
              <button type="button" onClick={() => control("stop")} className="text-[12px] text-ink-mid hover:text-red-600">
                Stop
              </button>
            )}
          </div>
        </>
      ) : open ? (
        <div className="mt-2 space-y-2">
          <input className={input} placeholder="Chase to (email)" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className={input} placeholder="Their commitment (quote)" value={quote} onChange={(e) => setQuote(e.target.value)} />
          <input className={input} placeholder="Escalation CC (email, optional)" value={escalation} onChange={(e) => setEscalation(e.target.value)} />
          <label className="block text-[11px] text-ink-mid">Deadline (optional)</label>
          <input type="date" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-paper-line px-3 py-1.5 text-xs text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={start}
              disabled={starting || !to.trim()}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-60"
              style={{ backgroundColor: BRAND.purple }}
            >
              {starting ? "Starting…" : "Start sequence"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-paper"
          style={{ backgroundColor: BRAND.purple }}
        >
          Start chase sequence
        </button>
      )}
    </div>
  );
}
