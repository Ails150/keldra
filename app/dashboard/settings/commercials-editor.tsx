"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Gate = { code: string; name: string | null };

export default function CommercialsEditor() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [standing, setStanding] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/org-commercials");
      const data = (await res.json().catch(() => ({}))) as {
        gates?: Gate[];
        commercials?: { gate_rates?: Record<string, number>; standing_rate?: number | null };
        error?: string;
      };
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? "Couldn't load commercials.");
        return;
      }
      setGates(data.gates ?? []);
      const gr = data.commercials?.gate_rates ?? {};
      setRates(Object.fromEntries((data.gates ?? []).map((g) => [g.code, gr[g.code] != null ? String(gr[g.code]) : ""])));
      setStanding(data.commercials?.standing_rate != null ? String(data.commercials.standing_rate) : "");
    })();
  }, []);

  async function save() {
    setStatus(null);
    setError(null);
    const gate_rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(rates)) if (v.trim()) gate_rates[k] = Number(v) || 0;
    const res = await fetch("/api/org-commercials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commercials: { gate_rates, standing_rate: standing.trim() ? Number(standing) : null } }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Couldn't save.");
      return;
    }
    setStatus("Saved.");
  }

  const input =
    "w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <main className="mx-auto max-w-2xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>
      <h1
        className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Commercials
      </h1>
      <p className="mt-1 text-sm text-ink-mid">
        Cost-of-delay rates for your org. These set the £/day exposure behind
        each gate and feed the dashboard burn figures. Typically prelims + LD
        exposure — your commercial team will have these.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-ink-mid">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-ink">Per-gate day rate (£/day)</h2>
            <div className="mt-2 space-y-2">
              {gates.length === 0 && (
                <p className="text-sm text-ink-mid">No gates yet — load a project first.</p>
              )}
              {gates.map((g) => (
                <div key={g.code} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-ink">
                    Gate {g.code}
                    {g.name ? <span className="text-ink-mid"> · {g.name}</span> : null}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={rates[g.code] ?? ""}
                    onChange={(e) => setRates((r) => ({ ...r, [g.code]: e.target.value }))}
                    placeholder="£/day"
                    className={input}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Standing-time rate (£/day)</h2>
            <p className="mt-1 text-[12px] text-ink-mid">
              Optional flat rate applied to non-critical tasks with no specific
              rate. Leave blank to require a rate per task.
            </p>
            <input
              type="number"
              min={0}
              value={standing}
              onChange={(e) => setStanding(e.target.value)}
              placeholder="£/day"
              className={`${input} mt-2`}
            />
          </section>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent"
            >
              Save commercials
            </button>
            {status && <span className="text-sm text-emerald-600">{status}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </main>
  );
}
