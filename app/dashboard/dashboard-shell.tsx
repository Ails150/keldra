"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { WizardData, ViewingRole, ViewingAs } from "../onboarding/types";
import SignOutButton from "../sign-out-button";
import { deriveOrgColour, getInitials, readStoredProject, roleLabel } from "./utils";
import {
  type ActionPayload,
  type BlockerMap,
  applyAction,
  hydrateFromProject,
  readBlockerState,
  setSitOnToday,
  writeBlockerState,
} from "./lib/blocker-state";
import TodayView from "./views/today";
import PeopleView from "./views/people";
import AssetsView from "./views/assets";
import ConstraintsView from "./views/constraints";
import ActivityView from "./views/activity-view";
import FunnelView from "./views/funnel-view";
import ScheduleView from "./views/schedule";
import IntelligenceView from "./views/intelligence";
import AuditView from "./views/audit";
import MapView from "./views/map-view";
import InviteOrgModal from "./views/invite-org-modal";
import BlockerDetailPanel from "./views/blocker-detail-panel";
import PlannedVsActualView from "./views/planned-vs-actual";
import HoldingBackView from "./views/holding-back";
import OverviewView from "./views/overview";

type Tab =
  | "overview"
  | "today"
  | "variance"
  | "funnel"
  | "people"
  | "holding-back"
  | "assets"
  | "constraints"
  | "promises"
  | "schedule"
  | "map"
  | "intelligence"
  | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "today", label: "Today" },
  { id: "variance", label: "Planned vs Actual" },
  { id: "funnel", label: "Funnel" },
  { id: "people", label: "People" },
  { id: "holding-back", label: "Holding back" },
  { id: "assets", label: "Assets" },
  { id: "constraints", label: "Constraints" },
  { id: "schedule", label: "Schedule" },
  { id: "map", label: "Map" },
  { id: "intelligence", label: "Intelligence" },
  { id: "audit", label: "Audit" },
];

type RoleOption = {
  orgName: string;
  orgType: string;
  role: ViewingRole;
  caption: string;
};

const DEMO_ROLE_OPTIONS: RoleOption[] = [
  {
    orgName: "Ardmac",
    orgType: "main-contractor",
    role: "main-contractor",
    caption: "Sees everything across the project",
  },
  {
    orgName: "Cental",
    orgType: "subcontractor",
    role: "subcontractor",
    caption: "Only Cental-owned items + interfaces with Ardmac",
  },
  {
    orgName: "Hyperscaler X",
    orgType: "client",
    role: "client",
    caption: "Org-level rollups and sign-off queue only",
  },
  {
    orgName: "Central Design",
    orgType: "design",
    role: "design",
    caption: "Design-driven constraints and RFIs only",
  },
];

export default function DashboardShell({ userEmail }: { userEmail: string }) {
  const [project, setProject] = useState<WizardData | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("overview");
  const [viewingAs, setViewingAs] = useState<ViewingAs | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [blockerMap, setBlockerMap] = useState<BlockerMap | null>(null);
  const [activeBlockerId, setActiveBlockerId] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<string[] | null>(null);
  const [mapZone, setMapZone] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredProject();
    setProject(stored);
    if (stored) {
      setViewingAs(
        stored.viewingAs ?? {
          orgName: "Ardmac",
          orgType: "main-contractor",
          role: "main-contractor",
        },
      );
    }
  }, []);

  // Hydrate blocker state once the project is known.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const existing = readBlockerState();
    if (existing) {
      setBlockerMap(existing);
      return;
    }
    (async () => {
      const fresh = await hydrateFromProject(project);
      if (cancelled) return;
      writeBlockerState(fresh);
      setBlockerMap(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Pick up blocker changes written by another tab (e.g. /field captures on the
  // same device) so they appear live without a manual refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "keldra_blocker_state") {
        const next = readBlockerState();
        if (next) setBlockerMap(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const actorName = useMemo(() => {
    if (!project) return userEmail || "Demo user";
    const first = (project.uploads.team ?? []).find(
      (p) => (p?.email ?? "").toString().trim().toLowerCase() === userEmail.toLowerCase(),
    );
    if (first && first.name) return first.name as string;
    // Fall back to the first person from the org the user is currently viewing as.
    const own = (project.uploads.team ?? []).find(
      (p) => (p?.organisation ?? "").toString().toLowerCase().includes((viewingAs?.orgName ?? "").toLowerCase()),
    );
    if (own && own.name) return own.name as string;
    return userEmail || "Demo user";
  }, [project, userEmail, viewingAs]);

  const openBlocker = useCallback((id: string) => {
    setActiveBlockerId(id);
  }, []);
  const closeBlocker = useCallback(() => setActiveBlockerId(null), []);

  const runBlockerAction = useCallback(
    async (id: string, actionId: string, payload?: ActionPayload) => {
      setBlockerMap((current) => {
        if (!current) return current;
        // Run async and write afterwards.
        void (async () => {
          const next = await applyAction(current, id, actionId, actorName, payload);
          writeBlockerState(next);
          setBlockerMap(next);
        })();
        return current;
      });
    },
    [actorName],
  );

  const toggleSit = useCallback((id: string, on: boolean) => {
    setBlockerMap((current) => {
      if (!current) return current;
      const next = setSitOnToday(current, id, on);
      writeBlockerState(next);
      return next;
    });
  }, []);

  const resetBlockers = useCallback(async () => {
    if (!project) return;
    const fresh = await hydrateFromProject(project);
    writeBlockerState(fresh);
    setBlockerMap(fresh);
    setActiveBlockerId(null);
  }, [project]);

  const jumpToAssets = useCallback((ids: string[]) => {
    setAssetFilter(ids.length > 0 ? ids : null);
    setActiveBlockerId(null);
    setTab("assets");
  }, []);

  // Routes a Smart Alert action_target ("blocker:<id>", "asset:<id>",
  // "person:<name>", "filter:unowned", "tab:<name>") to the right view.
  const handleAlertAction = useCallback(
    (target: string) => {
      const idx = target.indexOf(":");
      const kind = idx === -1 ? target : target.slice(0, idx);
      const value = idx === -1 ? "" : target.slice(idx + 1);
      switch (kind) {
        case "blocker":
          if (value) openBlocker(value);
          break;
        case "asset":
          if (value) jumpToAssets([value]);
          break;
        case "person":
          setTab("people");
          break;
        case "filter": // e.g. filter:unowned — surfaced on the constraints view
          setTab("constraints");
          break;
        case "zone": // zone:<zone_id> — open the map, highlight the zone
          setMapZone(value || null);
          setTab("map");
          break;
        case "tab":
          if (TABS.some((t) => t.id === value)) setTab(value as Tab);
          break;
        default:
          break;
      }
    },
    [openBlocker, jumpToAssets],
  );

  // Role options for the switcher — always offer the four demo personas, but
  // if the originating org isn't Ardmac, surface it as a fifth option so
  // Johnny can also flip back into his real org's view.
  const roleOptions = useMemo<RoleOption[]>(() => {
    const base = DEMO_ROLE_OPTIONS;
    if (!project) return base;
    const own = project.org.name?.trim();
    if (!own) return base;
    const alreadyListed = base.some(
      (o) => o.orgName.toLowerCase() === own.toLowerCase(),
    );
    if (alreadyListed) return base;
    return [
      {
        orgName: own,
        orgType: project.org.type ?? "main-contractor",
        role: project.viewingAs?.role ?? "main-contractor",
        caption: "Your organisation — default view",
      },
      ...base,
    ];
  }, [project]);

  if (project === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-mid">
        Loading…
      </div>
    );
  }

  if (project === null) {
    return <EmptyState userEmail={userEmail} />;
  }

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";
  const active = viewingAs ?? project.viewingAs;
  const activeColour = deriveOrgColour(active.orgName);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-paper-line bg-paper/85 backdrop-blur">
        <div
          className="mx-auto flex items-center justify-between gap-4 px-8 py-4"
          style={{ maxWidth: 1600 }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex flex-col gap-1">
              <span
                className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 22, lineHeight: 1 }}
              >
                Keldra<span style={{ color: "var(--accent)" }}>.</span>
              </span>
              <span
                className="font-mono font-semibold uppercase text-accent-deep"
                style={{
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  lineHeight: 1,
                }}
              >
                See · Solve · Scale
              </span>
            </div>
            <span className="hidden sm:inline text-ink-mid/60">·</span>
            <span className="hidden sm:inline text-sm font-medium text-ink truncate">
              {project.project.name || "Untitled project"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/dashboard/ingest"
              className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep transition-colors hover:text-accent md:inline"
            >
              Re-ingest data ↑
            </a>
            <a
              href="/field"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep transition-colors hover:text-accent md:inline"
            >
              Field mode ↗
            </a>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="hidden md:inline-flex items-center gap-2 rounded-xl border border-paper-line bg-paper-card px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              <span aria-hidden>＋</span> Tag in another organisation
            </button>
            <span className="hidden md:inline text-xs text-ink-mid">{userEmail}</span>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-paper font-semibold text-sm"
              title={userEmail}
            >
              {userInitial}
            </div>
            <SignOutButton />
          </div>
        </div>

        <div
          className="mx-auto flex items-center justify-between gap-4 px-8 pb-3"
          style={{ maxWidth: 1600 }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-paper-line bg-paper-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-accent"
            >
              <span className="text-ink-mid">Viewing as:</span>
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                style={{ backgroundColor: activeColour }}
              >
                {getInitials(active.orgName)}
              </span>
              <span className="text-ink">{active.orgName}</span>
              <span className="text-ink-mid">·</span>
              <span className="text-ink-mid">{roleLabel(active.role)}</span>
              <span className="text-ink-mid">▾</span>
            </button>

            {switcherOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSwitcherOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-2xl border border-paper-line bg-paper-card shadow-[0_12px_40px_-12px_rgba(26,15,43,0.25)]">
                  <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
                    Switch perspective
                  </p>
                  <ul className="py-1">
                    {roleOptions.map((o) => {
                      const isActive =
                        o.orgName === active.orgName && o.role === active.role;
                      return (
                        <li key={`${o.orgName}-${o.role}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setViewingAs({
                                orgName: o.orgName,
                                orgType: o.orgType,
                                role: o.role,
                              });
                              setSwitcherOpen(false);
                            }}
                            className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper-warm ${
                              isActive ? "bg-paper-warm" : ""
                            }`}
                          >
                            <span
                              className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                              style={{ backgroundColor: deriveOrgColour(o.orgName) }}
                            >
                              {getInitials(o.orgName)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink truncate">
                                {o.orgName}
                                <span className="ml-2 text-xs font-normal text-ink-mid">
                                  · {roleLabel(o.role)}
                                </span>
                              </p>
                              <p className="text-xs text-ink-mid leading-snug">
                                {o.caption}
                              </p>
                            </div>
                            {isActive && (
                              <span className="text-accent text-sm">✓</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-ink text-paper"
                      : "text-ink-mid hover:bg-paper-warm hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 py-8">
        {tab === "overview" && (
          <OverviewView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "today" && (
          <TodayView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
            onAlertAction={handleAlertAction}
          />
        )}
        {tab === "variance" && <PlannedVsActualView />}
        {tab === "funnel" && (
          <FunnelView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onAlertAction={handleAlertAction}
          />
        )}
        {tab === "people" && (
          <PeopleView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "holding-back" && (
          <HoldingBackView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "assets" && (
          <AssetsView
            project={project}
            viewingAs={active}
            highlightIds={assetFilter}
            onClearHighlight={() => setAssetFilter(null)}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "constraints" && (
          <ConstraintsView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "promises" && (
          <ActivityView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
            onAlertAction={handleAlertAction}
          />
        )}
        {tab === "schedule" && (
          <ScheduleView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
          />
        )}
        {tab === "map" && (
          <MapView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
            onOpenBlocker={openBlocker}
            onAlertAction={handleAlertAction}
            highlightZone={mapZone}
          />
        )}
        {tab === "intelligence" && (
          <IntelligenceView
            project={project}
            viewingAs={active}
            blockerMap={blockerMap}
          />
        )}
        {tab === "audit" && (
          <AuditView
            project={project}
            viewingAs={active}
            onResetBlockers={resetBlockers}
          />
        )}
      </main>

      {inviteOpen && (
        <InviteOrgModal
          activeRole={active.role}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {activeBlockerId && blockerMap && blockerMap[activeBlockerId] && (
        <BlockerDetailPanel
          blocker={blockerMap[activeBlockerId]}
          team={project.uploads.team}
          viewingAs={active}
          onClose={closeBlocker}
          onAction={(actionId, payload) =>
            runBlockerAction(activeBlockerId, actionId, payload)
          }
          onToggleSit={(on) => toggleSit(activeBlockerId, on)}
          onJumpToAssets={jumpToAssets}
        />
      )}
    </div>
  );
}

function EmptyState({ userEmail }: { userEmail: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-paper-line px-8 py-5">
        <span
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 24, lineHeight: 1 }}
        >
          Keldra
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-mid">{userEmail}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 40, lineHeight: 1.1 }}
        >
          No project yet
        </h1>
        <p
          className="mt-3 max-w-md font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17, lineHeight: 1.5 }}
        >
          Run the onboarding wizard to import your team, asset register and
          constraint log. Keldra will wire up your dashboard from the CSVs.
        </p>
        <Link
          href="/onboarding"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-accent-deep"
        >
          Set up your first project →
        </Link>
      </main>
    </div>
  );
}
