"use client";

import { useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import {
  deriveKeptRate,
  deriveOrgColour,
  displayName,
  filterPeopleByRole,
  getInitials,
  rollupByOrg,
  roleLabel,
} from "../utils";
import PersonDetailPanel from "./person-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function PeopleView({
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
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);

  if (role === "client") {
    return (
      <>
        <ClientRollups project={project} />
        <PersonDetailPanel
          person={selectedPerson}
          project={project}
          blockerMap={blockerMap}
          viewingAs={viewingAs}
          onClose={() => setSelectedPerson(null)}
          onOpenBlocker={onOpenBlocker}
        />
      </>
    );
  }

  const filtered = filterPeopleByRole(
    project.uploads.team,
    role,
    viewingAs.orgName,
  );

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          People
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          {peopleCaption(role, filtered.length)}
        </p>
      </header>

      <PeopleTable rows={filtered} onSelect={setSelectedPerson} />

      {role === "subcontractor" && (
        <ContactInterfaces project={project} viewingAs={viewingAs} />
      )}

      <PersonDetailPanel
        person={selectedPerson}
        project={project}
        blockerMap={blockerMap}
        viewingAs={viewingAs}
        onClose={() => setSelectedPerson(null)}
        onOpenBlocker={onOpenBlocker}
      />
    </section>
  );
}

function peopleCaption(role: ViewingAs["role"], n: number) {
  switch (role) {
    case "subcontractor":
      return `${n} from your organisation — plus the Ardmac contacts you interface with.`;
    case "design":
      return `${n} from Central Design.`;
    default:
      return `${n} across all organisations on this project.`;
  }
}

function PeopleTable({
  rows,
  onSelect,
}: {
  rows: any[];
  onSelect: (person: any) => void;
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-8 text-center text-sm text-ink-mid">
        No people in this view.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-paper-warm text-xs font-medium uppercase tracking-wide text-ink-mid">
          <tr>
            <th className="px-4 py-3 text-left">Person</th>
            <th className="px-4 py-3 text-left">Org</th>
            <th className="px-4 py-3 text-left">Role</th>
            <th className="px-4 py-3 text-left">Trade</th>
            <th className="px-4 py-3 text-left">Deputy</th>
            <th className="px-4 py-3 text-left">Kept-rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line">
          {rows.map((p: any, i: number) => {
            const name = displayName(p);
            const org = (p.organisation ?? "").toString().trim() || "—";
            const colour = deriveOrgColour(org);
            const kept = deriveKeptRate(name);
            return (
              <tr
                key={`${name}-${i}`}
                onClick={() => onSelect(p)}
                className="cursor-pointer transition-colors hover:bg-paper-warm"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                      style={{ backgroundColor: colour }}
                    >
                      {getInitials(name)}
                    </span>
                    <div>
                      <p className="font-medium text-ink leading-tight">{name}</p>
                      <p className="text-xs text-ink-mid">{p.email ?? ""}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-mid">{org}</td>
                <td className="px-4 py-3 text-ink-mid">{p.role ?? "—"}</td>
                <td className="px-4 py-3 text-ink-mid">{p.trade ?? "—"}</td>
                <td className="px-4 py-3 text-ink-mid">{p.deputy ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-warm">
                      <div
                        className={`h-full ${keptBar(kept)}`}
                        style={{ width: `${kept}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-ink-mid w-8">{kept}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function keptBar(n: number) {
  if (n >= 85) return "bg-green-500";
  if (n >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

function ContactInterfaces({
  project,
  viewingAs,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
}) {
  const mainContractor = (project.uploads.team ?? []).filter(
    (p: any) => (p.organisation ?? "").toLowerCase().includes("ardmac"),
  );
  if (mainContractor.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
        Ardmac contacts you interface with (read-only)
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {mainContractor.slice(0, 4).map((p: any, i: number) => {
          const name = displayName(p);
          return (
            <div
              key={`${name}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-3 py-2.5"
            >
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-paper"
                style={{ backgroundColor: deriveOrgColour("Ardmac") }}
              >
                {getInitials(name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{name}</p>
                <p className="text-xs text-ink-mid truncate">{p.role ?? "—"}</p>
              </div>
              <span className="rounded-full bg-paper-warm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
                Read-only
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-mid">
        Viewing as {viewingAs.orgName} · {roleLabel(viewingAs.role)} — contact details are visible but you can&apos;t edit them.
      </p>
    </div>
  );
}

function ClientRollups({ project }: { project: WizardData }) {
  // Override demo numbers per spec, falling back to derivation for any others.
  const overrides: Record<string, number> = {
    ardmac: 89,
    cental: 65,
    central: 84,
    primo: 73,
  };
  const orgs = rollupByOrg(project.uploads.team);
  const enriched = orgs.length
    ? orgs.map((o) => ({
        ...o,
        keptRate:
          overrides[o.org.toLowerCase().split(" ")[0]] ?? o.keptRate,
      }))
    : [
        { org: "Ardmac", colour: deriveOrgColour("Ardmac"), keptRate: 89, peopleCount: 6 },
        { org: "Cental", colour: deriveOrgColour("Cental"), keptRate: 65, peopleCount: 3 },
        { org: "Central Design", colour: deriveOrgColour("Central"), keptRate: 84, peopleCount: 2 },
        { org: "Primo Power", colour: deriveOrgColour("Primo"), keptRate: 73, peopleCount: 1 },
      ];

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          People
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          Org-level kept-rate — individual contributor data is not shown to clients.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {enriched.map((o) => (
          <div
            key={o.org}
            className="rounded-2xl border border-paper-line bg-paper-card p-5"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-paper"
                style={{ backgroundColor: o.colour }}
              >
                {getInitials(o.org)}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink leading-tight">{o.org}</p>
                <p className="text-xs text-ink-mid">{o.peopleCount} people on project</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                  Kept-rate
                </span>
                <span
                  className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                  style={{ fontSize: 28, lineHeight: 1 }}
                >
                  {o.keptRate}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-warm">
                <div
                  className={`h-full ${keptBar(o.keptRate)}`}
                  style={{ width: `${o.keptRate}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
