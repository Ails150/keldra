import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type Unmatched = {
  id: string;
  to_email: string | null;
  from_email: string | null;
  subject: string | null;
  reason: string | null;
  created_at: string;
};

// Superadmin-only view of inbound mail we couldn't match to a task thread, so
// nothing silently disappears.
export default async function UnmatchedPage() {
  const state = await getSessionState();
  if (state.status !== "ready" || state.profile.role !== "superadmin") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_unmatched")
    .select("id, to_email, from_email, subject, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Unmatched[];

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>
      <h1
        className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Unmatched inbound email
      </h1>
      <p className="mt-1 text-sm text-ink-mid">
        Replies that didn&apos;t match a task thread (bad/tampered token, unknown
        task, or a logging error). Superadmin only.
      </p>

      {error && (
        <p className="mt-6 text-sm text-red-600">Couldn&apos;t load: {error.message}</p>
      )}

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-mid">
          Nothing here — every inbound email matched a task. 🎉
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-paper-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-warm text-[11px] uppercase tracking-wide text-ink-mid">
              <tr>
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">From</th>
                <th className="px-4 py-2.5 font-semibold">To</th>
                <th className="px-4 py-2.5 font-semibold">Subject</th>
                <th className="px-4 py-2.5 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-paper-line align-top">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-mid whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{r.from_email ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink-mid break-all">
                    {r.to_email ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{r.subject ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-mid">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
