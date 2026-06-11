"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type OrgConfig = {
  terminology?: Record<string, string>;
  gate_structure?: { code: string; name: string }[];
  blocker_taxonomy?: string[];
  escalation_cadences?: Record<string, number>;
  sequence?: Record<string, unknown>;
};

type OrgRow = { id: string; name: string; config: OrgConfig | null; template: string | null };

const TERM_KEYS = ["project", "task", "gate", "blocker", "company", "room"];
const CADENCE_KEYS = ["first_chase_days", "escalate_after_days", "formal_after_days"];

export default function OrgConfigEditor() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [terminology, setTerminology] = useState<Record<string, string>>({});
  const [cadences, setCadences] = useState<Record<string, string>>({});
  const [arraysJson, setArraysJson] = useState("");
  const [seqEnabled, setSeqEnabled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrg = useCallback((org: OrgRow) => {
    const cfg = org.config ?? {};
    setTerminology({ ...(cfg.terminology ?? {}) });
    setCadences(
      Object.fromEntries(
        CADENCE_KEYS.map((k) => [k, String(cfg.escalation_cadences?.[k] ?? "")]),
      ),
    );
    setArraysJson(
      JSON.stringify(
        {
          gate_structure: cfg.gate_structure ?? [],
          blocker_taxonomy: cfg.blocker_taxonomy ?? [],
          sequence: cfg.sequence ?? {},
        },
        null,
        2,
      ),
    );
    setSeqEnabled(!!(cfg.sequence as { enabled?: boolean } | undefined)?.enabled);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/org-config");
      const data = (await res.json().catch(() => ({}))) as { orgs?: OrgRow[]; error?: string };
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? "Couldn't load configs.");
        return;
      }
      const list = data.orgs ?? [];
      setOrgs(list);
      if (list[0]) {
        setSelected(list[0].id);
        loadOrg(list[0]);
      }
    })();
  }, [loadOrg]);

  function onSelect(id: string) {
    setSelected(id);
    setStatus(null);
    setError(null);
    const org = orgs.find((o) => o.id === id);
    if (org) loadOrg(org);
  }

  async function save() {
    setStatus(null);
    setError(null);
    let arrays: { gate_structure?: unknown; blocker_taxonomy?: unknown; sequence?: Record<string, unknown> };
    try {
      arrays = JSON.parse(arraysJson);
    } catch {
      setError("Gate structure / taxonomy / sequence isn't valid JSON.");
      return;
    }
    // Preserve the sequence block; the toggle is the source of truth for enabled.
    const sequence = { ...(arrays.sequence ?? {}), enabled: seqEnabled };
    const config: OrgConfig = {
      terminology,
      escalation_cadences: Object.fromEntries(
        CADENCE_KEYS.map((k) => [k, Number(cadences[k]) || 0]),
      ),
      gate_structure: (arrays.gate_structure as OrgConfig["gate_structure"]) ?? [],
      blocker_taxonomy: (arrays.blocker_taxonomy as string[]) ?? [],
      sequence,
    };

    const res = await fetch("/api/org-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: selected, config }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Couldn't save.");
      return;
    }
    setStatus("Saved.");
    setOrgs((cur) => cur.map((o) => (o.id === selected ? { ...o, config } : o)));
  }

  const input =
    "w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <main className="mx-auto max-w-3xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>
      <h1
        className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Instance configuration
      </h1>
      <p className="mt-1 text-sm text-ink-mid">
        Per-org calibration — terminology, gate structure, blocker taxonomy and
        escalation cadences. Superadmin only.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-ink-mid">Loading…</p>
      ) : error && orgs.length === 0 ? (
        <p className="mt-8 text-sm text-red-600">{error}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-mid">
              Organisation
            </label>
            <select value={selected} onChange={(e) => onSelect(e.target.value)} className={input}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <section>
            <h2 className="text-sm font-semibold text-ink">Terminology</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TERM_KEYS.map((k) => (
                <div key={k}>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-mid">
                    {k}
                  </label>
                  <input
                    value={terminology[k] ?? ""}
                    onChange={(e) =>
                      setTerminology((t) => ({ ...t, [k]: e.target.value }))
                    }
                    className={input}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Escalation cadences (days)</h2>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {CADENCE_KEYS.map((k) => (
                <div key={k}>
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-mid">
                    {k.replace(/_/g, " ")}
                  </label>
                  <input
                    type="number"
                    value={cadences[k] ?? ""}
                    onChange={(e) => setCadences((c) => ({ ...c, [k]: e.target.value }))}
                    className={input}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Chase sequences</h2>
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={seqEnabled}
                onChange={(e) => setSeqEnabled(e.target.checked)}
              />
              Enable automatic sending for this org
            </label>
            <p className="mt-1 text-[11px] text-ink-mid">
              Off by default. When off, sequences are tracked and shown but never
              auto-send. Step copy, working hours, daily cap and timezone live in
              the JSON below (under <code>sequence</code>).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">
              Gate structure, blocker taxonomy &amp; sequence (JSON)
            </h2>
            <textarea
              value={arraysJson}
              onChange={(e) => setArraysJson(e.target.value)}
              rows={12}
              spellCheck={false}
              className={`${input} font-mono text-[12px]`}
            />
          </section>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent"
            >
              Save configuration
            </button>
            {status && <span className="text-sm text-emerald-600">{status}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </main>
  );
}
