"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { daysOpen, type BaselineTask } from "../../dashboard/lib/baseline-seed";
import { FIELD_PERSONA, personaBlockers } from "../field-persona";

function statusPill(status: BaselineTask["status"]): { label: string; cls: string } {
  switch (status) {
    case "blocked":
      return { label: "Blocked", cls: "bg-red-100 text-red-700" };
    case "not_started_should_be":
      return { label: "Not started", cls: "bg-amber-100 text-amber-800" };
    case "on_track":
      return { label: "On track", cls: "bg-teal-100 text-teal-800" };
    default:
      return { label: "Complete", cls: "bg-green-100 text-green-800" };
  }
}

export default function FieldBlockers() {
  const [mounted, setMounted] = useState(false);
  const [blockers, setBlockers] = useState<BaselineTask[]>([]);

  useEffect(() => {
    setMounted(true);
    setBlockers(personaBlockers());
  }, []);

  const burn = blockers.reduce((s, t) => s + t.cost_per_day, 0);

  return (
    <div className="space-y-4">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Your blockers
        </h1>
        <p className="mt-1 text-sm text-ink-mid">
          Open against {FIELD_PERSONA.companyName}
          {blockers.length > 0 && ` · £${Math.round(burn / 1000)}k/day combined`}
        </p>
      </header>

      {mounted && blockers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-8 text-center text-sm text-ink-mid">
          Nothing open against you right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {blockers.map((t) => {
            const pill = statusPill(t.status);
            const days = daysOpen(t);
            return (
              <li key={t.activity_id}>
                <Link
                  href={`/dashboard/tasks/${encodeURIComponent(t.activity_id)}`}
                  className="block rounded-2xl border border-paper-line bg-paper-card p-4 active:bg-paper-warm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-[10px] text-ink-mid">{t.activity_id}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug text-ink">
                    {t.name}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-ink-mid">
                      {days} {days === 1 ? "day" : "days"} open
                    </span>
                    {t.cost_per_day > 0 && (
                      <span className="font-mono text-sm font-semibold text-red-700">
                        £{Math.round(t.cost_per_day / 1000)}k/day
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="pt-1 text-center text-xs text-ink-mid">
        Blocked on something new?{" "}
        <Link href="/field/log" className="text-accent-deep underline">
          Log it
        </Link>
      </p>
    </div>
  );
}
