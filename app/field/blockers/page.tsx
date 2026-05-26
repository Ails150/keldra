"use client";

import { useState } from "react";
import Link from "next/link";
import { useField } from "../use-field";
import {
  type ActionPayload,
  applyAction,
  createCapturedBlocker,
  daysSinceRaised,
  isOpen,
  setSitOnToday,
} from "../../dashboard/lib/blocker-state";
import BlockerDetailPanel from "../../dashboard/views/blocker-detail-panel";

const PILL: Record<string, { label: string; cls: string }> = {
  unowned: { label: "Unowned", cls: "bg-red-100 text-red-700" },
  "pending-acceptance": { label: "Pending", cls: "bg-amber-100 text-amber-800" },
  accepted: { label: "Accepted", cls: "bg-teal-100 text-teal-800" },
  working: { label: "Working", cls: "bg-teal-100 text-teal-800" },
  "awaiting-input": { label: "Awaiting input", cls: "bg-amber-100 text-amber-800" },
  escalated: { label: "Escalated", cls: "bg-red-100 text-red-700" },
  "proposed-resolved": { label: "Proposed", cls: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", cls: "bg-green-100 text-green-800" },
  reopened: { label: "Reopened", cls: "bg-orange-100 text-orange-800" },
  closed: { label: "Closed", cls: "bg-zinc-200 text-zinc-700" },
};

export default function FieldBlockers() {
  const { project, blockerMap, persist, name } = useField();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [raiseText, setRaiseText] = useState("");

  const actor = name && name !== "there" ? name : "Field user";

  if (project === null) {
    return (
      <p className="pt-10 text-center text-sm text-ink-mid">
        No project set up yet.
      </p>
    );
  }

  const open = blockerMap
    ? Object.values(blockerMap)
        .filter(isOpen)
        .sort((a, b) => b.cost_per_day - a.cost_per_day)
    : [];

  const active = activeId && blockerMap ? blockerMap[activeId] : null;

  async function runAction(actionId: string, payload?: ActionPayload) {
    if (!blockerMap || !activeId) return;
    const next = await applyAction(blockerMap, activeId, actionId, actor, payload);
    persist(next);
  }

  function toggleSit(next: boolean) {
    if (!blockerMap || !activeId) return;
    persist(setSitOnToday(blockerMap, activeId, next));
  }

  async function raise() {
    const desc = raiseText.trim();
    if (!desc) return;
    const { map } = await createCapturedBlocker(blockerMap ?? {}, {
      actor,
      description: desc,
    });
    persist(map);
    setRaiseText("");
    setRaising(false);
  }

  return (
    <div className="space-y-4">
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 26, lineHeight: 1.1 }}
      >
        My blockers
      </h1>

      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-8 text-center text-sm text-ink-mid">
          Nothing open right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((b) => {
            const pill = PILL[b.state] ?? {
              label: b.state,
              cls: "bg-paper-warm text-ink-mid",
            };
            const days = daysSinceRaised(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(b.id)}
                  className="block w-full rounded-2xl border border-paper-line bg-paper-card p-4 text-left active:bg-paper-warm"
                >
                  <p className="font-mono text-[10px] text-ink-mid">{b.id}</p>
                  <p className="mt-0.5 text-sm leading-snug text-ink">
                    {b.description || "—"}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                    <span className="text-xs text-ink-mid">
                      {days} {days === 1 ? "day" : "days"} open
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Quick raise */}
      {raising ? (
        <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
          <textarea
            value={raiseText}
            onChange={(e) => setRaiseText(e.target.value)}
            placeholder="What are you blocked on?"
            rows={3}
            autoFocus
            className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={raise}
              disabled={!raiseText.trim()}
              className="min-h-[48px] flex-1 rounded-xl bg-accent-deep text-sm font-semibold text-paper active:bg-accent disabled:opacity-60"
            >
              Raise blocker
            </button>
            <button
              type="button"
              onClick={() => {
                setRaising(false);
                setRaiseText("");
              }}
              className="min-h-[48px] rounded-xl border-2 border-paper-line px-5 text-sm font-semibold text-ink active:bg-paper-warm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRaising(true)}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-semibold text-white active:bg-red-700"
        >
          <span aria-hidden>⚑</span> I&apos;m blocked
        </button>
      )}

      <p className="pt-1 text-center text-xs text-ink-mid">
        Need to attach a voice note or photo?{" "}
        <Link href="/field/capture" className="text-accent-deep underline">
          Open capture
        </Link>
      </p>

      {active && (
        <BlockerDetailPanel
          blocker={active}
          team={project?.uploads.team ?? null}
          viewingAs={
            project?.viewingAs ?? {
              orgName: "Mercury Engineering",
              orgType: "main-contractor",
              role: "main-contractor",
            }
          }
          onClose={() => setActiveId(null)}
          onAction={runAction}
          onToggleSit={toggleSit}
          onJumpToAssets={() => setActiveId(null)}
        />
      )}
    </div>
  );
}
