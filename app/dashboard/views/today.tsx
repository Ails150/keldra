"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import {
  filterAssetsByRole,
  filterConstraintsByRole,
  filterPeopleByRole,
  isBlankOwner,
  roleLabel,
} from "../utils";
import TodayRitual from "./today-ritual";
import SmartAlerts from "./smart-alerts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function TodayView({
  project,
  viewingAs,
  blockerMap,
  onOpenBlocker,
  onAlertAction,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
  onAlertAction?: (target: string) => void;
}) {
  const team = filterPeopleByRole(
    project.uploads.team,
    viewingAs.role,
    viewingAs.orgName,
  );
  const assets = filterAssetsByRole(
    project.uploads.assets,
    viewingAs.role,
    viewingAs.orgName,
  );
  const constraints = filterConstraintsByRole(
    project.uploads.constraints,
    viewingAs.role,
    viewingAs.orgName,
    project.uploads.team,
  );
  const unclear = constraints.filter(isBlankOwner);
  const role = viewingAs.role;

  // Stat tiles
  const tiles: {
    label: string;
    value: string | number;
    sub?: string;
    target?: string;
  }[] =
    role === "client"
      ? [
          { label: "Open constraints", value: constraints.length, sub: "Critical / client", target: "tab:constraints" },
          { label: "Awaiting sign-off", value: assets.filter((a) => (a.current_stage ?? "").toLowerCase().includes("yellow")).length, sub: "Yellow → Green", target: "tab:assets" },
          { label: "Orgs on project", value: new Set((project.uploads.team ?? []).map((p: any) => (p.organisation ?? "").toString().trim()).filter(Boolean)).size, sub: "Visible to you", target: "tab:people" },
        ]
      : role === "design"
        ? [
            { label: "Open design RFIs", value: constraints.length, sub: "Awaiting your action", target: "tab:constraints" },
            { label: "Assets with RFIs", value: assets.length, sub: "Across the register", target: "tab:assets" },
            { label: "Owner unclear", value: unclear.length, sub: "On design constraints", target: "filter:unowned" },
          ]
        : role === "subcontractor"
          ? [
              { label: "Your open items", value: constraints.length, sub: `On ${viewingAs.orgName}`, target: "tab:constraints" },
              { label: "Your assets", value: assets.length, sub: "Owned + interfaced", target: "tab:assets" },
              { label: "Owner unclear", value: unclear.length, sub: "Need someone to grab", target: "filter:unowned" },
            ]
          : [
              { label: "Open constraints", value: constraints.length, sub: "Across the project", target: "tab:constraints" },
              { label: "Owner unclear", value: unclear.length, sub: "Top of the pile", target: "filter:unowned" },
              { label: "People on project", value: team.length || project.uploads.team?.length || 0, sub: "Across all orgs", target: "tab:people" },
            ];

  // Today's walks — captioned per role
  const walks = walksForRole(role);
  const promises = promisesForRole(role);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-8">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Today
        </h1>
        <p
          className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 16 }}
        >
          What needs your attention from the {roleLabel(role)} seat.
        </p>
      </header>

      {blockerMap && (
        <SmartAlerts
          projectName={project.project.name}
          blockerMap={blockerMap}
          assets={project.uploads.assets ?? []}
          people={project.uploads.team ?? []}
          xer={project.uploads.xer}
          onAction={onAlertAction}
        />
      )}

      {blockerMap && (
        <TodayRitual map={blockerMap} onOpen={onOpenBlocker} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((t) => {
          const clickable = Boolean(t.target && onAlertAction);
          return (
            <button
              key={t.label}
              type="button"
              disabled={!clickable}
              onClick={() => t.target && onAlertAction?.(t.target)}
              className={`rounded-2xl border border-paper-line bg-paper-card p-5 text-left transition-shadow ${
                clickable ? "cursor-pointer hover:shadow-sm" : "cursor-default"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                {t.label}
              </p>
              <p
                className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 40, lineHeight: 1 }}
              >
                {t.value}
              </p>
              {t.sub && <p className="mt-1 text-xs text-ink-mid">{t.sub}</p>}
            </button>
          );
        })}
      </div>

      {unclear.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
            Needs your attention
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {unclear.slice(0, 4).map((c: any, i: number) => (
              <button
                type="button"
                key={c.id ?? i}
                onClick={() => c.id && onOpenBlocker(c.id)}
                className="rounded-2xl border border-red-200 bg-red-50/60 p-4 text-left transition-shadow hover:shadow-[0_4px_20px_-8px_rgba(220,38,38,0.4)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-red-700">{c.id ?? "—"}</p>
                    <p className="mt-1 text-sm text-ink">{c.description ?? "—"}</p>
                  </div>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                    Owner unclear
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-mid">
                  <span>
                    Deadline:{" "}
                    <span className="font-medium text-ink">
                      {c.deadline ?? "—"}
                    </span>
                  </span>
                  <span className="text-accent">Open →</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Today's walks" caption={walks.caption}>
          <ul className="space-y-3">
            {walks.items.map((w) => (
              <li key={w.title} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-paper-warm text-xs font-bold text-ink">
                  {w.time}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{w.title}</p>
                  <p className="text-xs text-ink-mid">{w.location}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${w.tone}`}
                >
                  {w.tag}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={promises.title} caption={promises.caption}>
          <ul className="space-y-3">
            {promises.items.map((p) => (
              <li key={p.title} className="flex items-start gap-3">
                <span
                  className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${p.dot}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink">{p.title}</p>
                  <p className="text-xs text-ink-mid">{p.by}</p>
                </div>
                <span className="text-xs font-medium text-ink-mid">{p.due}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {caption && <p className="text-xs text-ink-mid">{caption}</p>}
      </div>
      {children}
    </div>
  );
}

function walksForRole(role: ViewingAs["role"]) {
  switch (role) {
    case "subcontractor":
      return {
        caption: "Your patches today (Ardmac scope)",
        items: [
          { time: "09", title: "Drywall close-up — Colo Hall 2", location: "Colo Hall 2", tag: "Ardmac", tone: "bg-blue-100 text-blue-800" },
          { time: "11", title: "Containment QC walk", location: "MER1 Main Electrical Room", tag: "Joint", tone: "bg-purple-100 text-purple-800" },
          { time: "15", title: "Snag close-out with Mercury", location: "Colo Hall 2", tag: "Interface", tone: "bg-orange-100 text-orange-800" },
        ],
      };
    case "client":
      return {
        caption: "Witness slots booked with you",
        items: [
          { time: "10", title: "Yellow → Green witness — MER1-UPM-01", location: "MER1 Main Electrical Room", tag: "Sign-off", tone: "bg-yellow-100 text-yellow-800" },
          { time: "14", title: "IST dry-run review", location: "Admin Plant", tag: "Witness", tone: "bg-yellow-100 text-yellow-800" },
        ],
      };
    case "design":
      return {
        caption: "Design queries on site today",
        items: [
          { time: "10", title: "RFI-072 walk-down — chilled water tie-in", location: "Colo Hall 1", tag: "Design", tone: "bg-green-100 text-green-800" },
          { time: "13", title: "As-built mark-up review", location: "Admin Plant", tag: "RFI", tone: "bg-green-100 text-green-800" },
        ],
      };
    default:
      return {
        caption: "Your day across the site",
        items: [
          { time: "08", title: "Morning stand-up — all subs", location: "Site canteen", tag: "Lead", tone: "bg-red-100 text-red-700" },
          { time: "10", title: "Ardmac drywall closure walk", location: "Colo Hall 2", tag: "Joint", tone: "bg-blue-100 text-blue-800" },
          { time: "14", title: "Yellow → Green review with client", location: "MER1 Main Electrical Room", tag: "Witness", tone: "bg-yellow-100 text-yellow-800" },
        ],
      };
  }
}

function promisesForRole(role: ViewingAs["role"]) {
  const base = {
    title: "Your promises",
    caption: "Open promises tied to you",
  };
  switch (role) {
    case "subcontractor":
      return {
        ...base,
        caption: "Ardmac promises in/out",
        items: [
          { title: "Drywall snag close-out — Colo Hall 2", by: "Lawrence → Mercury", due: "Today 16:00", dot: "bg-yellow-500" },
          { title: "Containment QC sign-off pack", by: "Niamh → Mercury", due: "Tomorrow", dot: "bg-blue-500" },
          { title: "Punch-list returned to Mercury", by: "Cormac · kept", due: "Yesterday", dot: "bg-green-500" },
        ],
      };
    case "client":
      return {
        title: "Promises to you",
        caption: "Deliverables awaiting your sign-off",
        items: [
          { title: "L5 handover pack — MER1 Main Electrical Room", by: "Mercury → Client", due: "Fri", dot: "bg-yellow-500" },
          { title: "IST dry-run report", by: "Mercury → Client", due: "Mon", dot: "bg-blue-500" },
          { title: "Witness slot confirmation", by: "Sarah · pending", due: "Today", dot: "bg-orange-500" },
        ],
      };
    case "design":
      return {
        title: "Open RFIs from site",
        caption: "Design responses owed",
        items: [
          { title: "RFI-072 — chilled water tie-in", by: "Mercury → Central", due: "Overdue", dot: "bg-red-500" },
          { title: "RFI-074 — MER1 cable tray clash", by: "Ardmac → Central", due: "Today", dot: "bg-yellow-500" },
          { title: "RFI-070 — closed", by: "Central · kept", due: "Yesterday", dot: "bg-green-500" },
        ],
      };
    default:
      return {
        ...base,
        items: [
          { title: "Rev D drawing — MER1 containment", by: "Lawrence → you", due: "Overdue 2d", dot: "bg-red-500" },
          { title: "MER1-UPM-01 commissioning slot", by: "Patrick → you", due: "Today 14:00", dot: "bg-yellow-500" },
          { title: "Snag-list close-out", by: "Cormac · kept", due: "Yesterday", dot: "bg-green-500" },
        ],
      };
  }
}
