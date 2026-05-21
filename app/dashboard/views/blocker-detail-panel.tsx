"use client";

import { useMemo, useState } from "react";
import type { ViewingAs } from "../../onboarding/types";
import {
  type ActionDef,
  type ActionPayload,
  type Blocker,
  type PromptKind,
  computeCostSunk,
  daysInState,
  daysSinceRaised,
  getAvailableActions,
} from "../lib/blocker-state";
import { deriveOrgColour, getInitials } from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const STATE_PILL: Record<
  Blocker["state"],
  { label: string; classes: string }
> = {
  unowned: { label: "Unowned", classes: "bg-red-100 text-red-700" },
  "pending-acceptance": {
    label: "Pending acceptance",
    classes: "bg-amber-100 text-amber-800",
  },
  accepted: { label: "Accepted", classes: "bg-teal-100 text-teal-800" },
  working: { label: "Working", classes: "bg-teal-100 text-teal-800" },
  "awaiting-input": {
    label: "Awaiting input",
    classes: "bg-amber-100 text-amber-800",
  },
  escalated: { label: "Escalated", classes: "bg-red-100 text-red-700" },
  "proposed-resolved": {
    label: "Proposed resolved",
    classes: "bg-blue-100 text-blue-800",
  },
  verified: { label: "Verified", classes: "bg-green-100 text-green-800" },
  closed: { label: "Closed", classes: "bg-zinc-200 text-zinc-700" },
  reopened: { label: "Reopened", classes: "bg-orange-100 text-orange-800" },
};

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtEventVerb(evtType: string): string {
  const map: Record<string, string> = {
    raised: "raised",
    "assign-self": "accepted ownership",
    "assign-other": "assigned to someone",
    accept: "accepted",
    decline: "declined",
    reassign: "reassigned",
    start: "marked working",
    block: "marked blocked",
    chase: "chased",
    unblock: "marked unblocked",
    escalate: "escalated",
    "accept-pm": "PM accepted",
    propose: "proposed resolved",
    approve: "approved & closed",
    reject: "rejected proposal",
    close: "closed the blocker",
    restart: "restarted work",
    "add-evidence": "added photo evidence",
  };
  return map[evtType] ?? evtType;
}

function payloadPreview(p: Record<string, unknown>): string {
  if (!p || Object.keys(p).length === 0) return "";
  if (typeof p.note === "string" && p.note) return `"${p.note}"`;
  if (typeof p.reason === "string" && p.reason) return `"${p.reason}"`;
  if (typeof p.waiting_on === "string") return `waiting on ${p.waiting_on}`;
  if (typeof p.assigned_to === "string") return `→ ${p.assigned_to}`;
  if (typeof p.chased === "string") return `→ ${p.chased}`;
  if (typeof p.from_state === "string") return `from ${p.from_state}`;
  if (typeof p.evidence === "string") return "photo attached (stub)";
  return "";
}

type Props = {
  blocker: Blocker;
  team: any[] | null;
  viewingAs: ViewingAs;
  onClose: () => void;
  onAction: (actionId: string, payload?: ActionPayload) => Promise<void> | void;
  onToggleSit: (next: boolean) => void;
  onJumpToAssets: (ids: string[]) => void;
};

export default function BlockerDetailPanel({
  blocker,
  team,
  viewingAs,
  onClose,
  onAction,
  onToggleSit,
  onJumpToAssets,
}: Props) {
  const actions = useMemo(() => getAvailableActions(blocker), [blocker]);
  const [activePrompt, setActivePrompt] = useState<{
    action: ActionDef;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const pill = STATE_PILL[blocker.state] ?? STATE_PILL.unowned;
  const dInState = daysInState(blocker);
  const dSinceRaised = daysSinceRaised(blocker);
  const sunk = computeCostSunk(blocker);

  const overdue = dInState > 3;

  async function runAction(action: ActionDef, payload?: ActionPayload) {
    if (busy) return;
    if (action.prompts && action.prompts !== "photo-stub" && !payload) {
      setActivePrompt({ action });
      return;
    }
    setBusy(true);
    try {
      await onAction(action.id, payload);
      setActivePrompt(null);
    } finally {
      setBusy(false);
    }
  }

  const showChain =
    blocker.state === "awaiting-input" || blocker.state === "escalated";

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-label="Blocker detail"
        className="flex h-full w-[450px] max-w-full flex-col border-l border-paper-line bg-paper-card shadow-[0_0_50px_-10px_rgba(26,15,43,0.35)]"
      >
        <header className="border-b border-paper-line px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-mid">
                {blocker.id}
              </p>
              <h2
                className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 22, lineHeight: 1.2 }}
              >
                {blocker.description || "—"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-ink-mid transition-colors hover:bg-paper-warm hover:text-ink"
            >
              ✕
            </button>
          </div>

          {blocker.linked_assets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {blocker.linked_assets.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* State pill */}
          <section>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${pill.classes}`}
              >
                {pill.label}
              </span>
              <span
                className={`text-xs font-medium ${
                  overdue ? "text-red-700" : "text-ink-mid"
                }`}
              >
                {dInState} {dInState === 1 ? "day" : "days"} in this state
              </span>
            </div>
            {blocker.state === "awaiting-input" && blocker.waiting_on_person && (
              <p className="mt-2 text-xs text-ink-mid">
                Waiting on{" "}
                <span className="font-medium text-ink">
                  {blocker.waiting_on_person}
                </span>
                {blocker.waiting_on_org && (
                  <span> ({blocker.waiting_on_org})</span>
                )}{" "}
                since {fmtTimestamp(blocker.since_timestamp)}
              </p>
            )}
            {blocker.current_owner && blocker.state !== "awaiting-input" && (
              <p className="mt-2 text-xs text-ink-mid">
                Owner:{" "}
                <span className="font-medium text-ink">
                  {blocker.current_owner}
                </span>
                {blocker.current_owner_org && (
                  <span> · {blocker.current_owner_org}</span>
                )}
              </p>
            )}
          </section>

          {/* Cost of delay */}
          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">
              Cost of delay
            </p>
            <p
              className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-red-700"
              style={{ fontSize: 32, lineHeight: 1 }}
            >
              {GBP.format(blocker.cost_per_day)}/day
            </p>
            <p className="mt-1.5 text-xs text-ink">
              Sunk so far:{" "}
              <span className="font-semibold">{GBP.format(sunk)}</span>
            </p>
            <p
              className="mt-0.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
              style={{ fontSize: 13 }}
            >
              {dSinceRaised} {dSinceRaised === 1 ? "day" : "days"} since raised
            </p>
          </section>

          {/* Chain visualisation */}
          {showChain && (
            <Chain blocker={blocker} />
          )}

          {/* AI pattern card — pilot week 6 preview */}
          {blocker.description.trim().length > 10 && <AiPatternCard />}

          {/* Actions */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mid">
              Move this forward
            </h3>
            {actions.length === 0 ? (
              <p className="text-sm italic text-ink-mid">
                Nothing left to do — blocker is closed.
              </p>
            ) : (
              <div className="space-y-2">
                {actions.map((a) => {
                  const isPrompt =
                    activePrompt?.action.id === a.id && a.prompts;
                  return (
                    <div key={a.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (a.prompts === "photo-stub") {
                            void runAction(a);
                          } else if (a.prompts) {
                            setActivePrompt(
                              activePrompt?.action.id === a.id
                                ? null
                                : { action: a },
                            );
                          } else {
                            void runAction(a);
                          }
                        }}
                        className={
                          a.primary
                            ? "w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-50"
                            : "w-full rounded-xl border border-paper-line bg-paper-card px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                        }
                      >
                        {a.label}
                      </button>

                      {isPrompt && (
                        <PromptForm
                          kind={a.prompts as PromptKind}
                          team={team}
                          onCancel={() => setActivePrompt(null)}
                          onSubmit={(payload) => runAction(a, payload)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sit on today */}
          <section className="rounded-2xl border border-paper-line bg-paper-warm/50 p-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={blocker.sit_on_today}
                onChange={(e) => onToggleSit(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">
                  Sit on this today
                </p>
                <p className="text-xs text-ink-mid">
                  Stays in your morning review until it&apos;s moved.
                </p>
              </div>
              {blocker.sit_on_today && (
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-deep">
                  ★ On today&apos;s list
                </span>
              )}
            </label>
          </section>

          {/* History */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mid">
              History
            </h3>
            <ul className="space-y-2">
              {[...blocker.events]
                .slice()
                .reverse()
                .map((e) => {
                  const preview = payloadPreview(e.payload);
                  return (
                    <li
                      key={e.hash}
                      className="rounded-xl border border-paper-line bg-paper-card p-3"
                    >
                      <p className="text-xs text-ink-mid">
                        {fmtTimestamp(e.timestamp)} ·{" "}
                        <span className="font-medium text-ink">{e.actor}</span>{" "}
                        {fmtEventVerb(e.event_type)}
                        {preview && (
                          <span className="text-ink"> · {preview}</span>
                        )}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-ink-mid/70">
                        sha256:{e.hash.slice(0, 8)}…
                      </p>
                    </li>
                  );
                })}
            </ul>
          </section>
        </div>

        <footer className="border-t border-paper-line px-5 py-3">
          <button
            type="button"
            onClick={() => onJumpToAssets(blocker.linked_assets)}
            disabled={blocker.linked_assets.length === 0}
            className="flex w-full items-center justify-between text-left text-xs text-ink-mid transition-colors hover:text-ink disabled:opacity-50"
          >
            <span>
              Linked to{" "}
              <span className="font-semibold text-ink">
                {blocker.linked_assets.length}
              </span>{" "}
              {blocker.linked_assets.length === 1 ? "asset" : "assets"}
            </span>
            <span aria-hidden>›</span>
          </button>
          <p className="mt-1 font-mono text-[10px] text-ink-mid/70">
            Hash-chained · last event verified ·{" "}
            {blocker.events[blocker.events.length - 1]?.hash.slice(0, 8) ?? "—"}
          </p>
          <p className="mt-1 text-[10px] text-ink-mid">
            Viewing as {viewingAs.orgName}
          </p>
        </footer>
      </aside>
    </div>
  );
}

function Chain({ blocker }: { blocker: Blocker }) {
  const nodes: { name: string; org: string; caption: string }[] = [];
  const raised = blocker.events[0];
  if (raised) {
    nodes.push({
      name: raised.actor,
      org: blocker.current_owner_org ?? "—",
      caption: "raised",
    });
  }
  if (blocker.current_owner) {
    nodes.push({
      name: blocker.current_owner,
      org: blocker.current_owner_org ?? "—",
      caption: "accepted",
    });
  }
  if (blocker.waiting_on_person) {
    nodes.push({
      name: blocker.waiting_on_person,
      org: blocker.waiting_on_org ?? "—",
      caption: "waiting",
    });
  }
  if (nodes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-paper-line bg-paper-warm/40 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
        Chain
      </p>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {nodes.map((n, i) => (
          <span key={`${n.name}-${i}`} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                alert("Person detail panel — coming Saturday")
              }
              className="flex items-center gap-2 rounded-full bg-paper-card border border-paper-line px-2 py-1 transition-colors hover:border-accent"
            >
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-paper"
                style={{ backgroundColor: deriveOrgColour(n.org) }}
              >
                {getInitials(n.name)}
              </span>
              <span className="text-[11px] font-medium text-ink leading-tight">
                {n.name.split(" ")[0]}
              </span>
            </button>
            {i < nodes.length - 1 && (
              <span className="text-ink-mid/60">→</span>
            )}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-mid leading-snug">
        {nodes
          .map((n, i) =>
            i === 0
              ? `${n.name} raised`
              : i === nodes.length - 1 && blocker.waiting_on_person
                ? `waiting on ${n.name} (${n.org})`
                : `${n.name} ${n.caption}`,
          )
          .join(" → ")}
      </p>
    </section>
  );
}

function PromptForm({
  kind,
  team,
  onCancel,
  onSubmit,
}: {
  kind: PromptKind;
  team: any[] | null;
  onCancel: () => void;
  onSubmit: (payload: ActionPayload) => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string>("");

  if (kind === "photo-stub") {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-paper-line bg-paper-warm/40 p-3 text-xs text-ink-mid">
        Photo evidence — coming Sunday via Keldra Field mobile app.
      </div>
    );
  }

  if (kind === "person") {
    const options = (team ?? []).map((p: any) => ({
      name: (p.name ?? "").toString().trim(),
      org: (p.organisation ?? "").toString().trim(),
    })).filter((p) => p.name);
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-paper-line bg-paper-warm/40 p-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-mid">
          Pick a person
        </label>
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">—</option>
          {options.map((p) => (
            <option key={`${p.name}-${p.org}`} value={`${p.name}|${p.org}`}>
              {p.name} · {p.org || "—"}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-mid hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!picked}
            onClick={() => {
              const [name, org] = picked.split("|");
              onSubmit({ person: { name, org } });
            }}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-accent disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  const placeholder =
    kind === "reason" ? "Why?" : "What was the resolution?";
  const submitPayload: ActionPayload =
    kind === "reason" ? { reason: text } : { note: text };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-paper-line bg-paper-warm/40 p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-mid hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => onSubmit(submitPayload)}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-accent disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function AiPatternCard() {
  const notice =
    "Pilot week 6 deliverable — AI pattern detection coming once data volume exceeds 30 blockers across 6+ weeks.";
  return (
    <section className="rounded-2xl border border-accent/40 bg-paper-warm/70 p-4">
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-deep"
        style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
      >
        Pilot Week 6 · Pattern AI
      </p>
      <h3
        className="mt-1 font-[family-name:var(--font-fraunces)] font-medium text-ink"
        style={{ fontSize: 16, lineHeight: 1.25 }}
      >
        Keldra sees this pattern
      </h3>

      <p
        className="mt-2 text-ink leading-relaxed"
        style={{ fontSize: 13 }}
      >
        This blocker is structurally similar to 4 others Mercury has raised on
        hyperscaler DC projects. Pattern detected: ungrounded MEP elements in
        colo halls.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-3">
        <MiniStat label="Common owner-unclear" value="Mercury QS vs Ardmac PM" />
        <MiniStat label="Avg days to resolve" value="11 days" />
        <MiniStat label="Combined cost-of-delay" value="£62,000/day" />
      </div>

      <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-deep">
        Recommendation
      </p>
      <p
        className="mt-1 font-[family-name:var(--font-fraunces)] italic text-ink"
        style={{ fontSize: 14, lineHeight: 1.45 }}
      >
        Add MMR cable tray coordination to Tuesday&apos;s design review.
        Specifically resolve the Mercury QS vs Ardmac PM handoff for these
        assets: MMR1-CT-01, MMR1-CT-02, MMR1-CT-03.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => alert(notice)}
          className="rounded-full border border-accent/40 bg-paper-card px-3 py-1.5 text-[11px] font-medium text-accent-deep transition-colors hover:bg-accent hover:text-paper"
        >
          Schedule meeting
        </button>
        <button
          type="button"
          onClick={() => alert(notice)}
          className="rounded-full border border-paper-line bg-paper-card px-3 py-1.5 text-[11px] font-medium text-ink-mid transition-colors hover:border-accent/40 hover:text-ink"
        >
          Dismiss pattern
        </button>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-medium text-ink">{value}</p>
    </div>
  );
}
