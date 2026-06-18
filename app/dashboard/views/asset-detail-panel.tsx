"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Blocker, BlockerMap, BlockerStateName } from "../lib/blocker-state";
import { daysInState } from "../lib/blocker-state";
import { deriveOrgColour, getInitials, getLinkedBlockers } from "../utils";
import { slipDays, type ParsedXer } from "../../onboarding/lib/xer-parser";
import { normalizeStage, nextStage, stageMeta } from "../lib/cx-stages";
import { deriveDocCompletion } from "../lib/doc-completion";
import {
  listAssetHistory,
  signedPhotoUrl,
  subscribeFieldEvents,
  type MerFieldEvent,
} from "@/lib/supabase/mer-field";

type FieldCapture = {
  kind: "photo" | "voice";
  dataUrl: string | null;
  caption: string;
  by: string;
  ts: string;
  blockerId: string;
  blockerTitle: string;
  duration: number | null;
};

function truncateCap(s: string): string {
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// Asset-level R→Y→G commissioning tag ladder (the team's native model).
const TAG_PILL: Record<"red" | "yellow" | "green", string> = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
};
type ChecklistItem = { label: string; status: string; owner?: string | null };
type TagStatus = "achieved" | "in_progress" | "late" | "blocked";
type HistoryEntry = { seq: number; eventType: string; actorName: string | null; actorOrg: string | null; ts: string; payload: Record<string, unknown> };
type TagData = {
  tag: "red" | "yellow" | "green";
  status: TagStatus;
  owner: { name: string; org: string } | null;
  achievedDate: string | null;
  targetDate: string | null;
  daysAtTag: number | null;
  checklist: ChecklistItem[];
  history: HistoryEntry[];
};
const STATUS_PILL: Record<TagStatus, { label: string; classes: string }> = {
  achieved: { label: "Achieved", classes: "bg-green-100 text-green-800" },
  in_progress: { label: "In progress", classes: "bg-indigo-100 text-indigo-800" },
  late: { label: "Late", classes: "bg-amber-100 text-amber-800" },
  blocked: { label: "Blocked", classes: "bg-red-100 text-red-700" },
};
const EVENT_VERB: Record<string, string> = {
  red_achieved: "Red tag achieved",
  yellow_achieved: "Yellow tag achieved",
  green_achieved: "Green tag achieved",
  chase: "chased",
  response: "replied",
};
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

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
  const m = stageMeta(stage);
  return `${m.bg} ${m.text}`;
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
  const stage = normalizeStage(asset?.current_stage);
  let key: string | null = null;
  if (stage === "On GT" || stage === "Off GT") key = "green_date";
  else if (stage === "On YT" || stage === "Off YT") key = "yellow_tag_date";
  else if (stage === "RT") key = "red_tag_date";
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
  const [lightbox, setLightbox] = useState<FieldCapture | null>(null);

  // Asset-level commissioning tag + drawer data, fetched per org (RLS).
  // Anon/untagged → tagData stays null → the section is hidden (demo unaffected).
  const [tagData, setTagData] = useState<TagData | null>(null);
  const assetIdForTag = (asset?.asset_id ?? "").toString().trim();
  useEffect(() => {
    if (!assetIdForTag) { setTagData(null); return; }
    let live = true;
    fetch(`/api/assets/tag?assetId=${encodeURIComponent(assetIdForTag)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setTagData(j?.tag ? (j as TagData) : null); })
      .catch(() => { if (live) setTagData(null); });
    return () => { live = false; };
  }, [assetIdForTag]);

  if (!asset) return null;

  const activityId = (asset.activity_id ?? "").toString().trim();
  const activity =
    activityId && xer
      ? xer.activities.find((a) => a.task_code === activityId) ?? null
      : null;
  const activitySlip = activity ? slipDays(activity) : 0;

  // Photo / voice evidence captured in Field mode lives on the events of any
  // blocker linked to this asset.
  const thisId = (asset.asset_id ?? "").toString().trim();
  const photos: FieldCapture[] = [];
  const voices: FieldCapture[] = [];
  if (blockerMap) {
    for (const b of Object.values(blockerMap)) {
      if (!b.linked_assets.some((id) => id.trim() === thisId)) continue;
      for (const e of b.events) {
        const p = (e.payload ?? {}) as any;
        const base = {
          caption: (p.caption ?? "").toString(),
          by: (p.captured_by ?? e.actor ?? "—").toString(),
          ts: e.timestamp,
          blockerId: b.id,
          blockerTitle: b.description,
        };
        if (p.has_photo)
          photos.push({
            ...base,
            kind: "photo",
            dataUrl: p.photo_data_url ?? null,
            duration: null,
          });
        if (p.has_voice)
          voices.push({
            ...base,
            kind: "voice",
            dataUrl: p.voice_data_url ?? null,
            duration: typeof p.voice_duration === "number" ? p.voice_duration : null,
          });
      }
    }
  }
  photos.sort((a, b) => b.ts.localeCompare(a.ts));
  voices.sort((a, b) => b.ts.localeCompare(a.ts));

  const docs = deriveDocCompletion(asset);
  const docBar =
    docs.percentage >= 100
      ? "bg-green-500"
      : docs.percentage >= 80
        ? "bg-amber-500"
        : "bg-red-500";

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
                {normalizeStage(stage)}
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

          {/* Commissioning tag — ladder + strip + status + checklist (Foundation) */}
          {tagData && (() => {
            const tag = tagData.tag;
            const next = tag === "red" ? "Yellow" : tag === "yellow" ? "Green" : null;
            const st = STATUS_PILL[tagData.status] ?? STATUS_PILL.in_progress;
            return (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">Commissioning tag</p>
                <div className="flex items-center gap-1.5">
                  {(["red", "yellow", "green"] as const).map((t, i) => (
                    <Fragment key={t}>
                      {i > 0 && <span className="text-ink-mid" aria-hidden>→</span>}
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${TAG_PILL[t]} ${tag === t ? "" : "opacity-30"}`}>{t}</span>
                    </Fragment>
                  ))}
                  <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${st.classes}`}>{st.label}</span>
                </div>

                {/* dates / days-at-tag strip */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-paper-line bg-paper-card p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">{tag} delivered</p>
                    <p className="mt-1 text-sm font-medium text-ink">{fmtDay(tagData.achievedDate)}</p>
                  </div>
                  <div className="rounded-xl border border-paper-line bg-paper-card p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">Days at {tag}</p>
                    <p className="mt-1 text-sm font-medium text-ink">{tagData.daysAtTag == null ? "—" : `${tagData.daysAtTag}d`}</p>
                  </div>
                </div>

                {next && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-mid">To reach {next}</p>
                    {tagData.checklist.length === 0 ? (
                      <p className="text-xs text-ink-mid">No checklist items recorded.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {tagData.checklist.map((it, i) => {
                          const done = it.status === "approved";
                          return (
                            <li key={i} className="flex items-center gap-2 text-sm">
                              <span className={done ? "text-green-600" : "text-ink-mid"} aria-hidden>{done ? "✓" : "○"}</span>
                              <span className={done ? "text-ink" : "text-ink-mid"}>{it.label}</span>
                              {it.owner && <span className="text-[11px] text-ink-mid">· {it.owner}</span>}
                              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${done ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{done ? "Approved" : "Outstanding"}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
                {tag === "green" && <p className="mt-3 text-sm text-green-800">Operational — fully commissioned.</p>}

                {/* named owner */}
                {tagData.owner && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card p-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-paper" style={{ backgroundColor: deriveOrgColour(tagData.owner.org) }}>{getInitials(tagData.owner.name)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{tagData.owner.name}</p>
                      <p className="text-[11px] text-ink-mid">Owner{tagData.achievedDate ? ` · since ${fmtDay(tagData.achievedDate)}` : ""}</p>
                    </div>
                    {tagData.owner.org && <span className="ml-auto rounded-full bg-paper-warm px-2.5 py-1 text-[10px] font-semibold text-ink">{tagData.owner.org}</span>}
                  </div>
                )}

                {/* history — who / what / where / when / why / how */}
                {tagData.history.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-mid">History · who · what · where · when · why · how</p>
                    <ul className="space-y-2">
                      {tagData.history.map((e) => {
                        const p = e.payload ?? {};
                        const verb = EVENT_VERB[e.eventType] ?? e.eventType;
                        return (
                          <li key={e.seq} className="rounded-xl border border-paper-line bg-paper-card p-3">
                            <p className="font-mono text-[10.5px] text-ink-mid">{fmtDay(e.ts)}</p>
                            <p className="text-[13px] font-medium text-ink">{e.actorName ?? "—"} — {verb}</p>
                            {typeof p.what === "string" && <p className="mt-0.5 text-xs text-ink-mid">{p.what}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(["where", "why", "how"] as const).map((q) => typeof p[q] === "string" ? (
                                <span key={q} className="rounded-full bg-paper-warm px-2 py-0.5 text-[10px] text-ink-mid"><span className="font-[family-name:var(--font-fraunces)] italic text-accent-deep">{q}:</span> {p[q] as string}</span>
                              ) : null)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            );
          })()}

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

          {/* Photo evidence — captured via Keldra Field */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Photo evidence
              </p>
              {photos.length > 0 && (
                <span className="rounded-full bg-paper-warm px-2 py-0.5 text-[10px] font-semibold text-ink-mid">
                  {photos.length} {photos.length === 1 ? "capture" : "captures"}
                </span>
              )}
            </div>

            {photos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-paper-line bg-paper-warm/40 p-4 text-center">
                <p className="text-sm text-ink">
                  No site evidence captured yet.
                </p>
                <p className="mt-1 text-xs text-ink-mid">
                  Use Keldra Field on a phone to add photos.
                </p>
                <a
                  href="/field/capture"
                  className="mt-3 inline-flex rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-accent"
                >
                  Open Field mode
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map((c, i) => (
                  <button
                    key={`${c.blockerId}-${i}`}
                    type="button"
                    onClick={() => setLightbox(c)}
                    className="group overflow-hidden rounded-xl border border-paper-line bg-paper-warm/40 text-left"
                  >
                    <div className="flex h-20 w-full items-center justify-center bg-paper-warm">
                      {c.dataUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.dataUrl}
                          alt={c.caption || "Site evidence"}
                          className="h-20 w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-1 px-1 text-center text-ink-mid">
                          <CameraIcon />
                          <span className="text-[9px] leading-tight">
                            {c.caption ? truncateCap(c.caption) : "Photo"}
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="truncate px-1.5 py-1 text-[9px] text-ink-mid">
                      {c.by} · {timeAgo(c.ts)}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {photos.length > 6 && (
              <button
                type="button"
                onClick={() => setLightbox(photos[0])}
                className="mt-2 text-[11px] font-medium text-accent hover:text-accent-deep"
              >
                Show all {photos.length}
              </button>
            )}
          </section>

          {/* Voice notes — captured via Keldra Field */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Voice notes
              </p>
              {voices.length > 0 && (
                <span className="rounded-full bg-paper-warm px-2 py-0.5 text-[10px] font-semibold text-ink-mid">
                  {voices.length}
                </span>
              )}
            </div>
            {voices.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-paper-line bg-paper-warm/40 px-4 py-3 text-xs text-ink-mid">
                No voice notes captured yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {voices.map((c, i) => (
                  <li
                    key={`${c.blockerId}-v-${i}`}
                    className="rounded-xl border border-paper-line bg-paper-card p-3"
                  >
                    {c.dataUrl ? (
                      <audio controls src={c.dataUrl} className="w-full" />
                    ) : (
                      <p className="text-xs italic text-ink-mid">
                        Audio not stored (too large for local cache)
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-mid">
                      <span>
                        {c.by} · {timeAgo(c.ts)}
                      </span>
                      {c.duration ? <span>{c.duration}s</span> : null}
                    </div>
                    {c.caption && (
                      <p className="mt-1 text-xs text-ink">{c.caption}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Documents · Procore */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Documents · Procore
              </p>
              <a
                href="https://app.procore.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-accent hover:text-accent-deep"
              >
                Open in Procore →
              </a>
            </div>
            <div className="rounded-2xl border border-paper-line bg-paper-card p-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-paper-warm">
                <div
                  className={`h-full ${docBar}`}
                  style={{ width: `${docs.percentage}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink">
                {docs.complete} of {docs.total} complete · {docs.percentage}%
              </p>
              {docs.missing.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
                    Missing:
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {docs.missing.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-paper-warm px-2 py-0.5 text-[10px] text-ink-mid"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[10px] italic text-ink-mid">
                Source: Procore · last sync ~2h ago
              </p>
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
                { label: "Witness sign-off", who: "Design Coordinator (Main Contractor)" },
                { label: "Final approval", who: "Commissioning Lead (Main Contractor)" },
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
                `Advance ${asset.asset_id ?? "asset"} to ${nextStage(stage)} — photo evidence required (Keldra Field).`,
              )
            }
            className="rounded-xl bg-ink px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-accent"
          >
            Move to {nextStage(stage)}
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-paper-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full bg-paper-card/90 px-2 py-1 text-ink-mid transition-colors hover:text-ink"
            >
              ✕
            </button>
            {lightbox.dataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={lightbox.dataUrl}
                alt={lightbox.caption || "Site evidence"}
                className="max-h-[60vh] w-full bg-ink/5 object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center bg-paper-warm text-ink-mid">
                <CameraIcon />
              </div>
            )}
            <div className="p-4">
              {lightbox.caption && (
                <p className="text-sm text-ink">{lightbox.caption}</p>
              )}
              <p className="mt-1 text-xs text-ink-mid">
                Captured by {lightbox.by} · {timeAgo(lightbox.ts)}
              </p>
              <button
                type="button"
                onClick={() => {
                  const id = lightbox.blockerId;
                  setLightbox(null);
                  onClose();
                  onOpenBlocker(id);
                }}
                className="mt-3 text-xs font-medium text-accent hover:text-accent-deep"
              >
                {lightbox.blockerTitle} →
              </button>
            </div>
          </div>
        </div>
      )}
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

type HistEntry = { iso: number; date: string; label: string; who: string; photoUrl?: string | null; live?: boolean; key: string };

function liveLabel(e: MerFieldEvent): string {
  switch (e.kind) {
    case "red_tag": return e.comment ? `Red tag: ${e.comment}` : "Red tag raised";
    case "escalated": return `Escalated to ${e.role ?? "director"}`;
    case "response": return e.comment ? `Reply: ${e.comment}` : "Reply";
    case "comment": return e.comment ? `Comment: ${e.comment}` : "Comment";
    case "photo": return "Photo added";
    case "update": return e.comment ? `Update: ${e.comment}` : "Update";
    case "resolved": return "Resolved";
    default: return e.comment || e.kind;
  }
}

// History = seeded stage dates merged with the live Supabase log for this asset
// (comments, photos, escalations, replies), newest first, updating live.
function HistoryFromCsv({ asset }: { asset: any }) {
  const assetId = (asset?.asset_id ?? "").toString();

  const seeded = useMemo<HistEntry[]>(() => {
    const out: HistEntry[] = [];
    const add = (raw: unknown, label: string, who: string) => {
      const d = parseDate(raw);
      if (!d) return;
      out.push({ iso: d.getTime(), date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), label, who, key: `s-${label}-${d.getTime()}` });
    };
    add(asset.delivered_date, "Stage moved to Delivered", asset.owner_name || "Logistics");
    add(asset.installed_date, "Stage moved to Installed", asset.owner_name || "—");
    add(asset.red_tag_date, "Stage moved to Red-tag candidate", asset.raised_by || asset.owner_name || "—");
    add(asset.yellow_tag_date, "Stage moved to Yellow", asset.owner_name || "—");
    add(asset.green_date, "Stage moved to Green", asset.owner_name || "—");
    return out;
  }, [asset]);

  const [live, setLive] = useState<HistEntry[]>([]);

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    const toEntry = async (e: MerFieldEvent): Promise<HistEntry> => {
      const d = new Date(e.created_at);
      return {
        iso: d.getTime(),
        date: d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        label: liveLabel(e),
        who: e.actor + (e.with_party ? ` · with ${e.with_party}` : ""),
        photoUrl: await signedPhotoUrl(e.photo_path).catch(() => null),
        live: true,
        key: `l-${e.id}`,
      };
    };
    let unsub = () => {};
    const loadHistory = async () => {
      try {
        const hist = await listAssetHistory(assetId);
        const mapped = await Promise.all(hist.map(toEntry));
        if (!cancelled) setLive(mapped);
      } catch (err) {
        console.warn("asset history load:", (err as Error)?.message);
      }
    };
    const resubscribe = () => {
      try { unsub(); } catch {}
      unsub = subscribeFieldEvents({
        onInsert: async (e) => { if (e.asset_id !== assetId) return; const ent = await toEntry(e); setLive((p) => (p.some((x) => x.key === ent.key) ? p : [...p, ent])); },
        onDelete: (id) => setLive((p) => p.filter((x) => x.key !== `l-${id}`)),
      });
    };
    // Re-fetch + re-subscribe whenever the panel opens and on focus/visibility,
    // so an already-open dashboard never goes stale.
    const resync = () => { void loadHistory(); resubscribe(); };
    resync();
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", resync);
    return () => {
      cancelled = true;
      try { unsub(); } catch {}
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", resync);
    };
  }, [assetId]);

  const entries = useMemo(() => [...seeded, ...live].sort((a, b) => b.iso - a.iso), [seeded, live]);
  if (entries.length === 0) return null;

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
        History
      </p>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li
            key={e.key}
            className={`rounded-xl border p-3 ${e.live ? "border-accent/40 bg-accent/5" : "border-paper-line bg-paper-card"}`}
          >
            <p className="text-xs text-ink-mid">
              {e.live && <span className="mr-1 font-semibold text-accent-deep">● LIVE</span>}
              {e.date} — <span className="text-ink">{e.label}</span> ·{" "}
              <span className="font-medium text-ink">{e.who}</span>
            </p>
            {e.photoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={e.photoUrl} alt="Logged photo" className="mt-2 max-h-40 rounded-lg border border-paper-line object-cover" />
            )}
            {!e.live && (
              <p className="mt-1 font-mono text-[10px] text-ink-mid/70">
                sha256:{syntheticHash(asset, e.key)}…
              </p>
            )}
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
