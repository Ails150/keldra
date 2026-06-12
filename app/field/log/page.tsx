"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logActivity } from "@/lib/activity";
import {
  COMPANIES,
  type BaselineTask,
} from "../../dashboard/lib/baseline-seed";
import { FIELD_PERSONA, PERSONA_ACTOR, PM, personaTasks } from "../field-persona";

export default function FieldLog() {
  const router = useRouter();
  // Authenticated org users capture via the real per-task flow (task detail →
  // /api/field/capture). This demo log screen is anon-only.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("users").select("org_id").eq("id", user.id).maybeSingle();
        if (data?.org_id) router.replace("/field");
      } catch {
        /* anon → stay on the demo screen */
      }
    })();
  }, [router]);

  const [tasks, setTasks] = useState<BaselineTask[]>([]);
  const [what, setWhat] = useState("");
  const [taskId, setTaskId] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [why, setWhy] = useState("");
  const [photo, setPhoto] = useState(false);
  const [doneTask, setDoneTask] = useState<string | null>(null);

  useEffect(() => {
    setTasks(personaTasks());
  }, []);

  // Who you can be waiting on — every company except your own.
  const waitingOptions = useMemo(
    () => COMPANIES.filter((c) => c.slug !== FIELD_PERSONA.companySlug),
    [],
  );

  const canSubmit = what.trim().length > 0 && taskId.length > 0;

  function submit() {
    if (!canSubmit) return;
    const parts = [what.trim()];
    if (why.trim()) parts.push(why.trim());
    const waitName =
      COMPANIES.find((c) => c.slug === waitingOn)?.name ?? "";
    const body = `${parts.join(" — ")}${waitName ? ` (waiting on ${waitName})` : ""}${
      photo ? " [photo attached]" : ""
    }`;
    logActivity({
      task_id: taskId,
      type: "note",
      direction: "inbound",
      channel: "keldra",
      actor: PERSONA_ACTOR,
      recipient: PM,
      subject: "Field update from site",
      body,
    });
    setDoneTask(taskId);
  }

  if (doneTask) {
    return (
      <div className="space-y-5 pt-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
          ✓
        </div>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Logged. {PM.name} notified.
        </h1>
        <p className="text-sm text-ink-mid">
          Added to <span className="font-mono text-ink">{doneTask}</span> and on
          the director board now — it flowed straight up from here.
        </p>
        <div className="space-y-3 pt-2">
          <Link
            href="/field"
            className="flex min-h-[48px] items-center justify-center rounded-xl bg-accent-deep text-sm font-semibold text-paper active:bg-accent"
          >
            Back to home
          </Link>
          <button
            type="button"
            onClick={() => {
              setDoneTask(null);
              setWhat("");
              setTaskId("");
              setWaitingOn("");
              setWhy("");
              setPhoto(false);
            }}
            className="min-h-[48px] w-full rounded-xl border-2 border-paper-line text-sm font-semibold text-ink active:bg-paper-warm"
          >
            Log another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Log a blocker
        </h1>
        <p className="mt-1 text-sm text-ink-mid">
          90 seconds. It lands on {PM.name}&apos;s board.
        </p>
      </header>

      <Field label="What's blocked?">
        <textarea
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="e.g. Can't run fibre — brackets not installed"
          rows={2}
          className="w-full rounded-2xl border border-paper-line bg-paper-card p-4 text-base text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field label="Which task?">
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="min-h-[48px] w-full rounded-2xl border border-paper-line bg-paper-card px-4 text-base text-ink outline-none focus:border-accent"
        >
          <option value="">— Select a task —</option>
          {tasks.map((t) => (
            <option key={t.activity_id} value={t.activity_id}>
              {t.activity_id} — {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Who are you waiting on?">
        <select
          value={waitingOn}
          onChange={(e) => setWaitingOn(e.target.value)}
          className="min-h-[48px] w-full rounded-2xl border border-paper-line bg-paper-card px-4 text-base text-ink outline-none focus:border-accent"
        >
          <option value="">— Nobody / not sure —</option>
          {waitingOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Why? (optional)">
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Any detail that helps the PM act"
          rows={2}
          className="w-full rounded-2xl border border-paper-line bg-paper-card p-4 text-base text-ink outline-none focus:border-accent"
        />
      </Field>

      <button
        type="button"
        onClick={() => setPhoto((v) => !v)}
        className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-2 text-base font-semibold ${
          photo
            ? "border-accent-deep bg-accent/10 text-accent-deep"
            : "border-paper-line text-ink-mid active:bg-paper-warm"
        }`}
      >
        <span aria-hidden>◎</span> {photo ? "Photo attached ✓" : "Add photo"}
      </button>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-accent-deep text-base font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(94,37,163,0.6)] active:bg-accent disabled:opacity-60"
      >
        Log &amp; notify {PM.name.split(" ")[0]}
      </button>

      <p className="text-center text-xs text-ink-mid">
        Need voice or a real photo?{" "}
        <Link href="/field/capture" className="text-accent-deep underline">
          Open capture
        </Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
