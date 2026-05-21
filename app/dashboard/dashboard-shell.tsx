"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { WizardData, ViewingRole, ViewingAs } from "../onboarding/types";
import SignOutButton from "../sign-out-button";
import { deriveOrgColour, getInitials, readStoredProject, roleLabel } from "./utils";
import TodayView from "./views/today";
import PeopleView from "./views/people";
import AssetsView from "./views/assets";
import ConstraintsView from "./views/constraints";
import PromisesView from "./views/promises";
import AuditView from "./views/audit";
import InviteOrgModal from "./views/invite-org-modal";

type Tab = "today" | "people" | "assets" | "constraints" | "promises" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "people", label: "People" },
  { id: "assets", label: "Assets" },
  { id: "constraints", label: "Constraints" },
  { id: "promises", label: "Promises" },
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
    orgName: "Mercury Engineering",
    orgType: "main-contractor",
    role: "main-contractor",
    caption: "Sees everything across the project",
  },
  {
    orgName: "Ardmac",
    orgType: "subcontractor",
    role: "subcontractor",
    caption: "Only Ardmac-owned items + interfaces with Mercury",
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
  const [tab, setTab] = useState<Tab>("today");
  const [viewingAs, setViewingAs] = useState<ViewingAs | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredProject();
    setProject(stored);
    if (stored) {
      // Default to whatever the wizard saved; the demo can switch from there.
      setViewingAs(
        stored.viewingAs ?? {
          orgName: "Mercury Engineering",
          orgType: "main-contractor",
          role: "main-contractor",
        },
      );
    }
  }, []);

  // Role options for the switcher — always offer the four demo personas, but
  // if the originating org isn't Mercury, surface it as a fifth option so
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-8 py-4">
          <div className="flex items-center gap-4 min-w-0">
            <span
              className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1 }}
            >
              Keldra
            </span>
            <span className="hidden sm:inline text-ink-mid/60">·</span>
            <span className="hidden sm:inline text-sm font-medium text-ink truncate">
              {project.project.name || "Untitled project"}
            </span>
          </div>

          <div className="flex items-center gap-3">
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

        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-8 pb-3">
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
        {tab === "today" && <TodayView project={project} viewingAs={active} />}
        {tab === "people" && <PeopleView project={project} viewingAs={active} />}
        {tab === "assets" && <AssetsView project={project} viewingAs={active} />}
        {tab === "constraints" && (
          <ConstraintsView project={project} viewingAs={active} />
        )}
        {tab === "promises" && <PromisesView project={project} viewingAs={active} />}
        {tab === "audit" && <AuditView project={project} viewingAs={active} />}
      </main>

      {inviteOpen && (
        <InviteOrgModal
          activeRole={active.role}
          onClose={() => setInviteOpen(false)}
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
