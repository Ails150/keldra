import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type SeqRow = {
  id: string;
  task_code: string;
  status: string;
  current_step: number;
  total_steps: number;
  to_email: string;
  next_run_at: string | null;
  escalation_contact: string | null;
};

// Escalation lane: active/paused chase sequences for the org (RLS-scoped).
export default async function SequencesPage() {
  const state = await getSessionState();
  if (state.status === "needs-setup") redirect("/finish-setup");
  if (state.status !== "ready") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("task_sequences")
    .select("id,task_code,status,current_step,total_steps,to_email,next_run_at,escalation_contact")
    .in("status", ["active", "paused"])
    .order("next_run_at", { ascending: true });
  const rows = (data ?? []) as SeqRow[];

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <main className="mx-auto max-w-4xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>
      <h1
        className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Escalation lane
      </h1>
      <p className="mt-1 text-sm text-ink-mid">
        Active chase sequences. Each pauses automatically on an inbound reply.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-mid">No active sequences.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-paper-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-warm text-[11px] uppercase tracking-wide text-ink-mid">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Task</th>
                <th className="px-4 py-2.5 font-semibold">Step</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Next</th>
                <th className="px-4 py-2.5 font-semibold">Chasing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-paper-line">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/tasks/${encodeURIComponent(r.task_code)}`}
                      className="font-mono text-[12px] text-accent hover:text-accent-deep"
                    >
                      {r.task_code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    {Math.min(r.current_step + 1, r.total_steps)} / {r.total_steps}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        r.status === "active"
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-mid">{fmt(r.next_run_at)}</td>
                  <td className="px-4 py-2.5 text-ink-mid">{r.to_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
