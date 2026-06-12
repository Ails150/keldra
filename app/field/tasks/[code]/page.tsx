"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NoteComposer } from "@/app/dashboard/tasks/[activity_id]/task-notes";

const WITH_PARTIES = ["", "MEP Sub", "Mech Sub", "Design House", "Main Contractor", "Hyperscale Client", "Fire Sub", "Sprinkler Sub"];

type Task = { code: string; name: string | null; status: string | null; blocked_reason: string | null; affects_room: string | null };
type Capture = { id: string; title: string | null; description: string | null; state: string; created_at: string };

export default function FieldTaskDetail() {
  const params = useParams();
  const code = decodeURIComponent(String(params.code ?? ""));
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [captures, setCaptures] = useState<Capture[]>([]);

  const [comment, setComment] = useState("");
  const [withParty, setWithParty] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: t } = await supabase
      .from("tasks")
      .select("code, name, status, blocked_reason, affects_room")
      .eq("code", code)
      .maybeSingle();
    setTask((t as Task) ?? null);
    const { data: c } = await supabase
      .from("blockers")
      .select("id, title, description, state, created_at")
      .eq("task_code", code)
      .order("created_at", { ascending: false });
    setCaptures((c as Capture[]) ?? []);
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhotoFile(f);
    setPhotoName(f?.name ?? null);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set("taskCode", code);
    fd.set("comment", comment);
    fd.set("withParty", withParty);
    if (photoFile) fd.set("photo", photoFile);
    // Cookie session is sent automatically; the route derives org server-side.
    const res = await fetch("/api/field/capture", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save. Try again.");
      return;
    }
    setComment("");
    setWithParty("");
    setPhotoFile(null);
    setPhotoName(null);
    setDone(true);
    void load();
    setTimeout(() => setDone(false), 2500);
  }

  if (task === undefined) return <p className="pt-6 text-sm text-ink-mid">Loading…</p>;
  if (task === null) {
    return (
      <div className="space-y-4 pt-4">
        <Link href="/field" className="text-xs font-medium text-accent-deep">← Back</Link>
        <p className="text-sm text-ink-mid">Task <span className="font-mono">{code}</span> isn&apos;t in your list.</p>
      </div>
    );
  }

  const statusLabel = (task.status ?? "").replace(/_/g, " ");

  return (
    <div className="space-y-5">
      <Link href="/field" className="text-xs font-medium text-accent-deep">← Back to my tasks</Link>

      <header>
        <p className="font-mono text-[11px] text-accent-deep">{task.code}</p>
        <h1 className="mt-0.5 font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 24, lineHeight: 1.15 }}>
          {task.name ?? task.code}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {statusLabel && <span className="rounded-full bg-paper-warm px-2.5 py-1 font-medium text-ink">{statusLabel}</span>}
          {task.affects_room && <span className="rounded-full bg-paper-warm px-2.5 py-1 text-ink-mid">{task.affects_room}</span>}
        </div>
      </header>

      {task.blocked_reason && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Why it&apos;s blocked</p>
          <p className="mt-1 text-sm text-ink">{task.blocked_reason}</p>
        </div>
      )}

      {/* Capture */}
      <div className="space-y-3 rounded-2xl border border-paper-line bg-paper-card p-4">
        <p className="text-sm font-semibold text-ink">Raise a blocker / log an update</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What did you find? (e.g. leak at CRAH connection)"
          rows={3}
          className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
        />
        <select
          value={withParty}
          onChange={(e) => setWithParty(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-paper-line bg-paper px-3 text-base text-ink outline-none focus:border-accent"
        >
          {WITH_PARTIES.map((p) => (
            <option key={p} value={p}>{p ? `Waiting on ${p}` : "Who's it with? (optional)"}</option>
          ))}
        </select>
        <label className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10">
          <span aria-hidden>◎</span> {photoName ? `Photo: ${photoName}` : "Add photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-emerald-600">Saved — live on the dashboard.</p>}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-red-600 text-base font-semibold text-paper active:bg-red-700 disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Submit"}
        </button>
      </div>

      {/* Internal team note */}
      <NoteComposer taskCode={code} onPosted={() => void load()} />

      {/* Their submissions on this task */}
      {captures.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">On this task ({captures.length})</p>
          <ul className="mt-2 space-y-2">
            {captures.map((c) => (
              <li key={c.id} className="rounded-xl border border-paper-line bg-paper-card p-3">
                <p className="text-sm text-ink">{c.description || c.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-mid">
                  {c.state} · {new Date(c.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
