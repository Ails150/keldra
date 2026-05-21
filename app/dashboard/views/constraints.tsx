"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { Blocker, BlockerMap, BlockerStateName } from "../lib/blocker-state";
import { daysInState } from "../lib/blocker-state";
import {
  filterConstraintsByRole,
  isBlankOwner,
  roleLabel,
} from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ConstraintsView({
  project,
  viewingAs,
  blockerMap,
  onOpenBlocker,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
}) {
  const role = viewingAs.role;
  const all = filterConstraintsByRole(
    project.uploads.constraints,
    role,
    viewingAs.orgName,
    project.uploads.team,
  );

  const sorted = [...all].sort((a, b) => {
    const aBlank = isBlankOwner(a) ? 0 : 1;
    const bBlank = isBlankOwner(b) ? 0 : 1;
    return aBlank - bBlank;
  });

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Constraints
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          {caption(role, sorted.length, viewingAs.orgName)}
        </p>
      </header>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
          No constraints in this view.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sorted.map((c: any, i: number) => (
            <ConstraintCard
              key={c.id ?? i}
              row={c}
              blocker={c.id ? blockerMap?.[c.id] : undefined}
              onOpen={() => c.id && onOpenBlocker(c.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function caption(role: ViewingAs["role"], n: number, org: string) {
  switch (role) {
    case "subcontractor":
      return `${n} open items owned by or raised by ${org}.`;
    case "client":
      return `${n} critical / client-decision items — escalations only.`;
    case "design":
      return `${n} design-led items and RFIs.`;
    default:
      return `${n} open items — sorted by owner-unclear first.`;
  }
}

function priorityTone(p: string): string {
  const l = (p ?? "").toString().toLowerCase();
  if (l.includes("critical")) return "bg-red-100 text-red-700";
  if (l.includes("high")) return "bg-orange-100 text-orange-800";
  if (l.includes("medium")) return "bg-yellow-100 text-yellow-800";
  if (l.includes("low")) return "bg-blue-100 text-blue-800";
  return "bg-paper-warm text-ink-mid";
}

const STATE_PILL: Record<BlockerStateName, { label: string; classes: string }> = {
  unowned: { label: "Unowned", classes: "bg-red-100 text-red-700" },
  "pending-acceptance": { label: "Pending acceptance", classes: "bg-amber-100 text-amber-800" },
  accepted: { label: "Accepted", classes: "bg-teal-100 text-teal-800" },
  working: { label: "Working", classes: "bg-teal-100 text-teal-800" },
  "awaiting-input": { label: "Awaiting input", classes: "bg-amber-100 text-amber-800" },
  escalated: { label: "Escalated", classes: "bg-red-100 text-red-700" },
  "proposed-resolved": { label: "Proposed resolved", classes: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", classes: "bg-green-100 text-green-800" },
  closed: { label: "Closed", classes: "bg-zinc-200 text-zinc-700" },
  reopened: { label: "Reopened", classes: "bg-orange-100 text-orange-800" },
};

function ConstraintCard({
  row,
  blocker,
  onOpen,
}: {
  row: any;
  blocker: Blocker | undefined;
  onOpen: () => void;
}) {
  const blank = isBlankOwner(row);
  const state = blocker?.state ?? (blank ? "unowned" : "pending-acceptance");
  const pill = STATE_PILL[state] ?? STATE_PILL.unowned;
  const dIn = blocker ? daysInState(blocker) : 0;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`block w-full rounded-2xl border p-4 text-left transition-shadow hover:shadow-[0_8px_28px_-12px_rgba(26,15,43,0.25)] ${
          blank ? "border-red-200 bg-red-50/60" : "border-paper-line bg-paper-card"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-ink-mid">{row.id ?? "—"}</p>
              {row.priority && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(row.priority)}`}>
                  {row.priority}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill.classes}`}>
                {pill.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink">{row.description ?? "—"}</p>
          </div>
          {blocker?.sit_on_today && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent-deep">
              ★ Today
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-ink-mid">
          <div>
            <span className="opacity-70">Owner: </span>
            <span className="font-medium text-ink">
              {blocker?.current_owner || row.owner_name?.trim() || "—"}
            </span>
          </div>
          <div>
            <span className="opacity-70">Org: </span>
            <span className="font-medium text-ink">
              {blocker?.current_owner_org || row.owner_org || "—"}
            </span>
          </div>
          <div>
            <span className="opacity-70">Deadline: </span>
            <span className="font-medium text-ink">{row.deadline ?? "—"}</span>
          </div>
          <div>
            <span className="opacity-70">In state: </span>
            <span className={`font-medium ${dIn > 3 ? "text-red-700" : "text-ink"}`}>
              {dIn} {dIn === 1 ? "day" : "days"}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] font-medium text-accent">Open blocker →</p>
      </button>
    </li>
  );
}
