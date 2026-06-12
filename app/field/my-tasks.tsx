"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AssignedTask = {
  code: string;
  name: string | null;
  status: string | null;
  affects_room: string | null;
};

// The authenticated field worker's own assigned tasks. Empty list shows the
// friendly "no tasks assigned yet". Guarded so it degrades to empty if
// task_assignments isn't migrated yet.
export default function MyFieldTasks({ name }: { name: string | null }) {
  const [tasks, setTasks] = useState<AssignedTask[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setTasks([]);
          return;
        }
        const { data } = await supabase
          .from("task_assignments")
          .select("tasks(code,name,status,affects_room)")
          .eq("user_id", user.id);
        const list = (data ?? []).flatMap((r) => {
          const t = (r as { tasks: AssignedTask | AssignedTask[] | null }).tasks;
          return Array.isArray(t) ? t : t ? [t] : [];
        });
        setTasks(list);
      } catch {
        setTasks([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-deep">
          Your tasks
        </p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 28, lineHeight: 1.1 }}
        >
          {name ? `Hi, ${name.split(" ")[0]}` : "Your tasks"}
        </h1>
      </header>

      {tasks === null ? (
        <p className="text-sm text-ink-mid">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-paper-line bg-paper-card p-6 text-center">
          <p className="text-sm text-ink-mid">No tasks assigned yet.</p>
          <p className="mt-1 text-xs text-ink-mid">
            Your site lead will assign you tasks — they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.code}>
              <Link
                href={`/field/tasks/${encodeURIComponent(t.code)}`}
                className="flex items-center justify-between gap-2 rounded-2xl border border-paper-line bg-paper-card p-4 active:bg-paper-warm"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[11px] text-accent-deep">{t.code}</span>
                  <span className="mt-0.5 block text-sm font-medium text-ink">{t.name ?? t.code}</span>
                  <span className="mt-1 block text-xs text-ink-mid">
                    {(t.status ?? "").replace(/_/g, " ")}
                    {t.affects_room ? ` · ${t.affects_room}` : ""}
                  </span>
                </span>
                <span className="flex-shrink-0 text-2xl text-ink-mid">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-ink-mid">
        Tap a task above to add a photo, raise a blocker or log an update.
      </p>
    </div>
  );
}
