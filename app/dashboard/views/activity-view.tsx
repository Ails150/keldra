"use client";

import { useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { deriveOrgColour, getInitials } from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Category = "blockers" | "assets" | "people" | "photos";

type Entry = {
  id: string;
  ts: number;
  actor: string;
  org: string;
  sentence: string;
  pill: string;
  category: Category;
  target: { type: "blocker" | "asset"; id: string };
};

const VERB: Record<string, string> = {
  raised: "raised",
  "assign-self": "accepted ownership of",
  "assign-other": "assigned",
  accept: "accepted",
  decline: "declined",
  reassign: "reassigned",
  start: "started work on",
  block: "marked blocked:",
  chase: "chased on",
  unblock: "unblocked",
  escalate: "escalated",
  propose: "proposed resolved:",
  approve: "approved",
  reject: "reopened",
  close: "closed",
  restart: "restarted",
  "add-evidence": "added evidence to",
  "field-capture": "captured field evidence on",
  comment: "commented on",
};

const PEOPLE_EVENTS = new Set([
  "assign-self",
  "assign-other",
  "accept",
  "decline",
  "reassign",
  "escalate",
]);

const FILTERS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "blockers", label: "Blockers" },
  { id: "assets", label: "Assets" },
  { id: "people", label: "People" },
  { id: "photos", label: "Photos" },
];

function shorten(s: string, n = 60): string {
  const t = (s ?? "").toString();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now.getTime() - 86400000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })} ${time}`;
}

function bucket(ts: number): string {
  const now = Date.now();
  const d = new Date(ts);
  if (d.toDateString() === new Date(now).toDateString()) return "Today";
  if (d.toDateString() === new Date(now - 86400000).toDateString())
    return "Yesterday";
  const days = (now - ts) / 86400000;
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  return "Earlier";
}

const BUCKET_ORDER = ["Today", "Yesterday", "This week", "Last week", "Earlier"];

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
  onAlertAction?: (target: string) => void;
};

export default function ActivityView({
  project,
  viewingAs: _viewingAs,
  blockerMap,
  onOpenBlocker,
  onAlertAction,
}: Props) {
  const [filter, setFilter] = useState<"all" | Category>("all");

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    if (blockerMap) {
      for (const b of Object.values(blockerMap)) {
        for (const e of b.events) {
          const t = new Date(e.timestamp).getTime();
          if (Number.isNaN(t)) continue;
          const payload = (e.payload ?? {}) as any;
          const verb = VERB[e.event_type] ?? e.event_type;
          const category: Category = payload.has_photo
            ? "photos"
            : PEOPLE_EVENTS.has(e.event_type)
              ? "people"
              : "blockers";
          out.push({
            id: `${b.id}-${e.hash.slice(0, 10)}`,
            ts: t,
            actor: e.actor || "Someone",
            org: b.current_owner_org ?? "",
            sentence: `${e.actor || "Someone"} ${verb} ${shorten(b.description)}`,
            pill: b.id,
            category,
            target: { type: "blocker", id: b.id },
          });
        }
      }
    }

    for (const a of project.uploads.assets ?? []) {
      const aid = (a.asset_id ?? "").toString().trim();
      if (!aid) continue;
      const owner = (a.owner_name ?? "").toString().trim() || "Site team";
      const org = (a.owner_org ?? "").toString().trim();
      const add = (date: unknown, label: string) => {
        const t = new Date((date ?? "").toString()).getTime();
        if (Number.isNaN(t)) return;
        out.push({
          id: `${aid}-${label}`,
          ts: t,
          actor: owner,
          org,
          sentence: `${owner} moved ${aid} to ${label}`,
          pill: aid,
          category: "assets",
          target: { type: "asset", id: aid },
        });
      };
      add(a.red_tag_date, "RT");
      add(a.yellow_tag_date, "Yellow Tag");
      add(a.green_date, "Green Tag");
    }

    return out.sort((x, y) => y.ts - x.ts).slice(0, 50);
  }, [blockerMap, project.uploads.assets]);

  const shown = entries.filter(
    (e) => filter === "all" || e.category === filter,
  );

  const groups = new Map<string, Entry[]>();
  for (const e of shown) {
    const k = bucket(e.ts);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }

  function open(e: Entry) {
    if (e.target.type === "blocker") onOpenBlocker(e.target.id);
    else onAlertAction?.(`asset:${e.target.id}`);
  }

  return (
    <section className="mx-auto max-w-3xl px-8 space-y-5">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Activity
        </h1>
        <p
          className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 16 }}
        >
          Every state change across the project, newest first.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-ink text-paper"
                : "border border-paper-line text-ink-mid hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
          No activity captured yet. Activity appears here as your team raises,
          accepts, escalates, and closes blockers.
        </div>
      ) : (
        <div className="space-y-5">
          {BUCKET_ORDER.filter((k) => groups.has(k)).map((k) => (
            <div key={k}>
              <div className="sticky top-0 z-10 -mx-2 bg-paper/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-mid backdrop-blur">
                {k}
              </div>
              <ul className="mt-1 space-y-2">
                {groups.get(k)!.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => open(e)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-paper-line bg-paper-card px-4 py-3 text-left transition-colors hover:bg-paper-warm/60"
                    >
                      <span
                        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                        style={{ backgroundColor: deriveOrgColour(e.org || e.actor) }}
                      >
                        {getInitials(e.actor)}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-ink">
                        {e.sentence}
                      </span>
                      <span className="text-[11px] text-ink-mid">
                        {fmtWhen(e.ts)}
                      </span>
                      <span className="rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink-mid">
                        {e.pill}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
