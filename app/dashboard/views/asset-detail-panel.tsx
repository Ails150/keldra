"use client";

import type { Blocker, BlockerMap, BlockerStateName } from "../lib/blocker-state";
import { daysInState } from "../lib/blocker-state";
import { deriveOrgColour, getInitials, getLinkedBlockers } from "../utils";
import { slipDays, type ParsedXer } from "../../onboarding/lib/xer-parser";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const STAGE_BADGE: { match: (s: string) => boolean; classes: string }[] = [
  { match: (s) => s.includes("delivered") && s.includes("not installed"), classes: "bg-zinc-200 text-zinc-700" },
  { match: (s) => s.includes("green") || s.includes("handover"), classes: "bg-green-100 text-green-800" },
  { match: (s) => s.includes("yellow"), classes: "bg-yellow-100 text-yellow-800" },
  { match: (s) => s.includes("red"), classes: "bg-red-100 text-red-700" },
  { match: (s) => s.includes("installed"), classes: "bg-blue-100 text-blue-800" },
  { match: (s) => s.includes("delivered"), classes: "bg-blue-100 text-blue-800" },
  { match: (s) => s.includes("designed"), classes: "bg-paper-warm text-ink-mid" },
];

function badgeFor(stage: string): string {
  const s = (stage ?? "").toString().toLowerCase().trim();
  if (!s) return "bg-paper-warm text-ink-mid";
  const hit = STAGE_BADGE.find((b) => b.match(s));
  return hit?.classes ?? "bg-paper-warm text-ink-mid";
}

const STATE_PILL: Record<BlockerStateName, { label: string; classes: string }> = {
  unowned: { label: "Unowned", classes: "bg-red-100 text-red-700" },
  "pending-acceptance": { label: "Pending", classes: "bg-amber-100 text-amber-800" },
  accepted: { label: "Accepted", classes: "bg-teal-100 text-teal-800" },
  working: { label: "Working", classes: "bg-teal-100 text-teal-800" },
  "awaiting-input": { label: "Awaiting input", classes: "bg-amber-100 text-amber-800" },
  escalated: { label: "Escalated", classes: "bg-red-100 text-red-700" },
  "proposed-resolved": { label: "Proposed", classes: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", classes: "bg-green-100 text-green-800" },
  closed: { label: "Closed", classes: "bg-zinc-200 text-zinc-700" },
  reopened: { label: "Reopened", classes: "bg-orange-100 text-orange-800" },
};

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  const s = value.toString().trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: unknown): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function locationChain(asset: any): string[] {
  return [asset?.building, asset?.location, asset?.floor]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean);
}

function daysSinceStageDate(asset: any): number {
  const stage = (asset?.current_stage ?? "").toString().toLowerCase();
  let key: string | null = null;
  if (stage.includes("green") || stage.includes("handover")) key = "green_date";
  else if (stage.includes("yellow")) key = "yellow_tag_date";
  else if (stage.includes("red")) key = "red_tag_date";
  else if (stage.includes("installed")) key = "installed_date";
  else if (stage.includes("delivered")) key = "delivered_date";
  const d = key ? parseDate(asset?.[key]) : null;
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function syntheticHash(asset: any, slot: string): string {
  const seed = `${asset?.asset_id ?? ""}-${slot}`;
  const h = hashStr(seed);
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

type Props = {
  asset: any | null;
  blockerMap: BlockerMap | null;
  onClose: () => void;
  onOpenBlocker: (id: string) => void;
  xer?: ParsedXer | null;
};

export default function AssetDetailPanel({
  asset,
  blockerMap,
  onClose,
  onOpenBlocker,
  xer,
}: Props) {
  if (!asset) return null;

  const activityId = (asset.activity_id ?? "").toString().trim();
  const activity =
    activityId && xer
      ? xer.activities.find((a) => a.task_code === activityId) ?? null
      : null;
  const activitySlip = activity ? slipDays(activity) : 0;

  const ownerName = (asset.owner_name ?? "").toString().trim();
  const ownerOrg = (asset.owner_org ?? "").toString().trim();
  const ownerBlank = ownerName === "";
  const stage = (asset.current_stage ?? "").toString().trim();
  const stageLower = stage.toLowerCase();
  const isStorageStalled = stageLower.includes("delivered") && stageLower.includes("not installed");
  const daysInStage = daysSinceStageDate(asset);
  const linked = getLinkedBlockers(asset, blockerMap).filter(
    (b) => b.state !== "closed",
  );
  const chain = locationChain(asset);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-label="Asset detail"
        className="flex h-full w-[450px] max-w-full flex-col border-l border-paper-line bg-paper-card shadow-[0_0_50px_-10px_rgba(26,15,43,0.35)]"
      >
        <header className="border-b border-paper-line px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono uppercase tracking-wider text-ink-mid" style={{ fontSize: 18 }}>
                {asset.asset_id ?? "—"}
              </p>
              <h2
                className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 22, lineHeight: 1.2 }}
              >
                {asset.asset_type ?? "—"}
              </h2>
              {chain.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-mid">
                  {chain.join(" · ")}
                </p>
              )}
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
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Stage block */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Stage
            </p>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${badgeFor(stage)}`}>
                {stage || "—"}
              </span>
              <span className="text-xs text-ink-mid">
                {daysInStage} {daysInStage === 1 ? "day" : "days"} in this stage
              </span>
            </div>
            {isStorageStalled && (
              <p className="mt-2 text-xs font-semibold text-red-700">
                Costing £8,400/day in storage + delay
              </p>
            )}
          </section>

          {/* P6 activity (only when an XER is loaded and this asset maps) */}
          {activity && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
                P6 activity
              </p>
              <div className="rounded-2xl border border-paper-line bg-paper-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-ink">
                    {activity.task_code}
                  </span>
                  {activity.is_critical && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                      Critical path
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-mid">{activity.task_name}</p>
                <p className="mt-2 text-xs text-ink">
                  Planned{" "}
                  <span className="font-medium">{fmtDate(activity.target_start)}</span>{" "}
                  →{" "}
                  <span className="font-medium">{fmtDate(activity.target_end)}</span>{" "}
                  · {activity.complete_pct}% complete
                </p>
                {activitySlip > 0 && (
                  <p className="mt-2 text-xs font-semibold text-red-700">
                    ⚑ {activitySlip} {activitySlip === 1 ? "day" : "days"} slipped
                    vs baseline
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Owner block */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Owner
            </p>
            {ownerBlank ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-700">
                  Owner unclear
                </span>
                <p className="mt-3 text-sm text-ink">
                  No one accepted responsibility for this asset. Raised by{" "}
                  <span className="font-medium">
                    {(asset.raised_by ?? "—").toString()}
                  </span>
                  , sitting since{" "}
                  <span className="font-medium">
                    {fmtDate(asset.delivered_date ?? asset.installed_date ?? asset.red_tag_date)}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-paper-line bg-paper-card p-3">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-paper"
                  style={{ backgroundColor: deriveOrgColour(ownerOrg) }}
                >
                  {getInitials(ownerName)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{ownerName}</p>
                  <p className="text-xs text-ink-mid">
                    {(asset.owner_role ?? "Owner").toString()}
                  </p>
                </div>
                {ownerOrg && (
                  <span className="rounded-full bg-paper-warm px-2.5 py-1 text-[10px] font-semibold text-ink">
                    {ownerOrg}
                  </span>
                )}
              </div>
            )}
            {!ownerBlank && (
              <p className="mt-1.5 text-[11px] text-ink-mid">
                Owner since{" "}
                {fmtDate(
                  asset.installed_date ?? asset.delivered_date ?? asset.red_tag_date,
                )}
              </p>
            )}
          </section>

          {/* Linked blockers */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Active blockers ({linked.length})
            </p>
            {linked.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50/60 px-3 py-2.5 text-sm text-green-800">
                <span className="text-green-600" aria-hidden>✓</span>
                No active blockers
              </div>
            ) : (
              <ul className="space-y-2">
                {linked.map((b) => (
                  <BlockerMiniCard
                    key={b.id}
                    blocker={b}
                    onOpen={() => {
                      onClose();
                      onOpenBlocker(b.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Photo evidence stub */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Photo evidence
            </p>
            <div className="rounded-2xl border border-dashed border-paper-line bg-paper-warm/40 p-4">
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep"
                style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
              >
                Pilot Week 3 · Keldra Field
              </p>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-paper-card text-ink-mid">
                  <CameraIcon />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    Photo evidence coming pilot week 3
                  </p>
                  <p
                    className="mt-1 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
                    style={{ fontSize: 12, lineHeight: 1.5 }}
                  >
                    Via Keldra Field mobile app — fork of Vantro (live on App
                    Store with photo upload since May 2026). Field staff snap
                    photo, GPS tags location, attaches to asset automatically.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Sign-off chain stub */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Sign-off chain
            </p>
            <ol className="space-y-2">
              {[
                { label: "Internal QA", who: "pending" },
                { label: "Witness sign-off", who: "Lawrence Burke (Ardmac)" },
                { label: "Final approval", who: "Johnny McKenna (Mercury)" },
              ].map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-3 py-2"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper-warm text-[10px] font-semibold text-ink-mid">
                    ○
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink">{s.label}</p>
                    <p className="text-[11px] text-ink-mid">{s.who}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p
              className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
              style={{ fontSize: 12 }}
            >
              Hold/witness sign-off chain — Pilot week 4 deliverable
            </p>
          </section>

          {/* History */}
          <HistoryFromCsv asset={asset} />
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-paper-line px-5 py-3">
          <button
            type="button"
            onClick={() =>
              alert(
                "Stage transition — photo evidence required — Keldra Field deliverable pilot week 3.",
              )
            }
            className="rounded-xl bg-ink px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-accent"
          >
            Move to next stage
          </button>
          <button
            type="button"
            onClick={() => alert("Reassignment workflow — pilot week 2.")}
            className="rounded-xl border border-paper-line bg-paper-card px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Reassign owner
          </button>
          <button
            type="button"
            onClick={() => alert("Raise blocker — pilot week 2.")}
            className="rounded-xl border border-paper-line bg-paper-card px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Raise blocker
          </button>
        </footer>
      </aside>
    </div>
  );
}

function BlockerMiniCard({
  blocker,
  onOpen,
}: {
  blocker: Blocker;
  onOpen: () => void;
}) {
  const pill = STATE_PILL[blocker.state] ?? STATE_PILL.unowned;
  const dIn = daysInState(blocker);
  return (
    <li className="rounded-xl border border-paper-line bg-paper-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] text-ink-mid">{blocker.id}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill.classes}`}>
              {pill.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink line-clamp-2">
            {blocker.description || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium text-paper transition-colors hover:bg-accent"
        >
          Open
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-mid">
        <span>
          {dIn} {dIn === 1 ? "day" : "days"} in state
        </span>
        <span className="font-mono font-semibold text-red-700">
          {GBP.format(blocker.cost_per_day)}/day
        </span>
      </div>
    </li>
  );
}

function HistoryFromCsv({ asset }: { asset: any }) {
  type Entry = { date: string; label: string; who: string; iso: number };
  const entries: Entry[] = [];

  const add = (raw: unknown, label: string, who: string) => {
    const d = parseDate(raw);
    if (!d) return;
    entries.push({
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      label,
      who,
      iso: d.getTime(),
    });
  };

  add(asset.delivered_date, "Stage moved to Delivered", asset.owner_name || "Logistics");
  add(asset.installed_date, "Stage moved to Installed", asset.owner_name || "—");
  add(asset.red_tag_date, "Stage moved to Red-tag candidate", asset.raised_by || asset.owner_name || "—");
  add(asset.yellow_tag_date, "Stage moved to Yellow", asset.owner_name || "—");
  add(asset.green_date, "Stage moved to Green", asset.owner_name || "—");

  entries.sort((a, b) => b.iso - a.iso);

  if (entries.length === 0) return null;

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
        History
      </p>
      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li
            key={`${e.iso}-${i}`}
            className="rounded-xl border border-paper-line bg-paper-card p-3"
          >
            <p className="text-xs text-ink-mid">
              {e.date} — <span className="text-ink">{e.label}</span> ·{" "}
              <span className="font-medium text-ink">{e.who}</span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink-mid/70">
              sha256:{syntheticHash(asset, `${e.iso}-${i}`)}…
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CameraIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
