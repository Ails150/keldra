"use client";

import type { StepProps, InviteEntry } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ORG_COLOURS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#0f766e",
];

function initialsFor(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colourForOrg(org: string): string {
  const key = (org || "").trim().toLowerCase();
  if (!key) return "#5a4a72";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ORG_COLOURS[h % ORG_COLOURS.length];
}

function inviteFromTeamRow(row: any, idx: number): InviteEntry {
  const name = (row.name ?? "").toString().trim();
  const org = (row.organisation ?? "").toString().trim();
  return {
    id: `team-${idx}`,
    name: name || "—",
    email: (row.email ?? "").toString().trim() || "—",
    org: org || "—",
    role: (row.role ?? "").toString().trim() || "—",
    initials: initialsFor(name),
    colour: colourForOrg(org),
  };
}

export default function Step6Invites({ formData }: StepProps) {
  const teamRows = formData.uploads.team;
  const haveTeam = teamRows && teamRows.length > 0;

  const invites: InviteEntry[] = haveTeam
    ? teamRows!.map((r, i) => inviteFromTeamRow(r, i))
    : formData.invites;

  const visible = invites.slice(0, 5);
  const moreCount = Math.max(0, invites.length - visible.length);

  const orgsCount = haveTeam
    ? new Set(
        teamRows!
          .map((r: any) => ((r.organisation ?? "") as string).trim().toLowerCase())
          .filter(Boolean),
      ).size || formData.otherOrgs.length + 1
    : formData.otherOrgs.length + 1;

  const peopleCount = formData.uploads.team?.length ?? 12;
  const assetsCount = formData.uploads.assets?.length ?? 247;
  const constraintsCount = formData.uploads.constraints?.length ?? 9;

  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          Send the invites
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          We&apos;ve pulled these out of your team roster. Review and finish — they&apos;ll get a magic link.
        </p>
      </header>

      <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
        <ul className="divide-y divide-paper-line">
          {visible.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-5 py-4">
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-paper font-semibold text-sm"
                style={{ backgroundColor: p.colour }}
              >
                {p.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate">{p.name}</p>
                <p className="text-xs text-ink-mid truncate">{p.email}</p>
              </div>
              <span className="rounded-full bg-paper-warm px-2.5 py-1 text-xs font-medium text-ink">
                {p.org}
              </span>
              <span className="hidden sm:inline text-sm text-ink-mid w-40 truncate">
                {p.role}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                Ready
              </span>
            </li>
          ))}
        </ul>

        {moreCount > 0 && (
          <div className="border-t border-paper-line bg-paper-warm px-5 py-3 text-center text-xs font-medium uppercase tracking-wide text-ink-mid">
            + {moreCount} more
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-paper-line bg-paper-card p-6 md:grid-cols-4">
        <div className="text-center">
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 36, lineHeight: 1 }}
          >
            {orgsCount}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-mid">
            Organisations
          </p>
        </div>
        <div className="text-center">
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 36, lineHeight: 1 }}
          >
            {peopleCount}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-mid">
            People
          </p>
        </div>
        <div className="text-center">
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 36, lineHeight: 1 }}
          >
            {assetsCount}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-mid">
            Assets
          </p>
        </div>
        <div className="text-center">
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 36, lineHeight: 1 }}
          >
            {constraintsCount}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-mid">
            Constraints
          </p>
        </div>
      </div>
    </section>
  );
}
