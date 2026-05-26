"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BlockerMap,
  daysSinceRaised,
  isOpen,
  totalDailyExposure,
} from "../lib/blocker-state";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Alert = {
  type: "PATTERN" | "TREND" | "ALERT" | "RECOMMENDATION" | string;
  title: string;
  body: string;
  action_label?: string;
  action_target?: string;
};

type Props = {
  projectName: string;
  blockerMap: BlockerMap;
  assets: any[];
  people: any[];
  onAction?: (target: string) => void;
};

function typePill(type: string): string {
  switch (type) {
    case "ALERT":
      return "bg-red-100 text-red-700";
    case "PATTERN":
      return "bg-accent/10 text-accent-deep";
    case "TREND":
      return "bg-blue-100 text-blue-800";
    case "RECOMMENDATION":
      return "bg-green-100 text-green-800";
    default:
      return "bg-paper-warm text-ink-mid";
  }
}

// Maps the dashboard's BlockerMap into the /api/insights payload shape. The
// route expects owner_name (we hold current_owner) and a precomputed days_open.
function buildPayload(
  projectName: string,
  map: BlockerMap,
  assets: any[],
  people: any[],
) {
  const open = Object.values(map).filter(isOpen);
  const blockers = open.map((b) => ({
    id: b.id,
    description: b.description,
    state: b.state,
    priority: b.priority,
    owner_name: b.current_owner ?? "",
    owner_org: b.current_owner_org ?? "",
    cost_per_day: b.cost_per_day,
    date_raised: b.raised_date,
    days_open: daysSinceRaised(b),
  }));
  return {
    projectName,
    blockers,
    assets,
    people,
    totalExposurePerDay: totalDailyExposure(map),
    unownedCount: open.filter((b) => b.state === "unowned").length,
    awaitingInputCount: open.filter((b) => b.state === "awaiting-input").length,
  };
}

export default function SmartAlerts({
  projectName,
  blockerMap,
  assets,
  people,
  onAction,
}: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(projectName, blockerMap, assets, people)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setSource(typeof data.source === "string" ? data.source : null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("Couldn't load insights.");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [projectName, blockerMap, assets, people]);

  // Fetch once when the blocker set is first available; the Refresh button
  // re-runs against the current state on demand.
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    if (Object.keys(blockerMap).length === 0) return;
    ranRef.current = true;
    void run();
    return () => abortRef.current?.abort();
  }, [blockerMap, run]);

  // Hide the panel entirely once we know there's nothing to show.
  if (!loading && !error && alerts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-accent/30 bg-[color:var(--accent)]/[0.03] p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">✨</span>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
            Smart Alerts
          </p>
          {source && (
            <span className="rounded-full bg-paper-warm px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-mid">
              {source === "gemini" ? "Gemini 2.5 Flash" : "Rule-based"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="rounded-full border border-paper-line bg-paper-card px-2.5 py-1 text-[10px] font-medium text-ink-mid transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {loading ? "Analysing…" : "Refresh"}
        </button>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-paper-line bg-paper-card"
            />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs italic text-ink-mid">{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {alerts.map((a, i) => (
            <div
              key={`${a.title}-${i}`}
              className="flex flex-col rounded-xl border border-paper-line bg-paper-card p-4"
            >
              <span
                className={`mb-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${typePill(a.type)}`}
              >
                {a.type}
              </span>
              <p className="text-sm font-medium leading-snug text-ink">{a.title}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-mid">
                {a.body}
              </p>
              {a.action_label && a.action_target && (
                <button
                  type="button"
                  onClick={() => onAction?.(a.action_target!)}
                  className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-ink px-3 py-1 text-[10px] font-medium text-paper transition-colors hover:bg-accent"
                >
                  {a.action_label} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
