"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import {
  filterConstraintsByRole,
  isBlankOwner,
  orgKey,
  roleLabel,
} from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ConstraintsView({
  project,
  viewingAs,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
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
              role={role}
              viewingAs={viewingAs}
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

function escalationTarget(row: any, role: ViewingAs["role"]): string {
  const owner = orgKey(row.owner_org);
  if (role === "client") return "Main contractor";
  if (role === "design") return "Mercury";
  if (role === "subcontractor") return "Main contractor";
  if (owner === "ardmac") return "Ardmac PM";
  if (owner === "central") return "Central Design";
  if (owner === "client") return "Client";
  return "Project lead";
}

function priorityTone(p: string): string {
  const l = (p ?? "").toString().toLowerCase();
  if (l.includes("critical")) return "bg-red-100 text-red-700";
  if (l.includes("high")) return "bg-orange-100 text-orange-800";
  if (l.includes("medium")) return "bg-yellow-100 text-yellow-800";
  if (l.includes("low")) return "bg-blue-100 text-blue-800";
  return "bg-paper-warm text-ink-mid";
}

function ConstraintCard({
  row,
  role,
  viewingAs,
}: {
  row: any;
  role: ViewingAs["role"];
  viewingAs: ViewingAs;
}) {
  const blank = isBlankOwner(row);
  const escalate = escalationTarget(row, role);

  return (
    <li
      className={`rounded-2xl border p-4 ${
        blank ? "border-red-200 bg-red-50/60" : "border-paper-line bg-paper-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-ink-mid">{row.id ?? "—"}</p>
            {row.priority && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(row.priority)}`}>
                {row.priority}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink">{row.description ?? "—"}</p>
        </div>
        {blank && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700">
            Owner unclear
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-ink-mid">
        <div>
          <span className="opacity-70">Owner: </span>
          <span className="font-medium text-ink">
            {row.owner_name?.trim() || "—"}
          </span>
        </div>
        <div>
          <span className="opacity-70">Org: </span>
          <span className="font-medium text-ink">{row.owner_org ?? "—"}</span>
        </div>
        <div>
          <span className="opacity-70">Deadline: </span>
          <span className="font-medium text-ink">{row.deadline ?? "—"}</span>
        </div>
        <div>
          <span className="opacity-70">Raised by: </span>
          <span className="font-medium text-ink">{row.raised_by ?? "—"}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CardButton
          tone="primary"
          onClick={() =>
            alert(
              `Would prompt to assign an owner for ${row.id} — defaulting to ${escalate}.`,
            )
          }
        >
          Resolve owner
        </CardButton>
        <CardButton
          tone="warning"
          onClick={() =>
            alert(
              `Escalating ${row.id} to ${escalate} (viewing as ${roleLabel(role)} · ${viewingAs.orgName}).`,
            )
          }
        >
          Escalate to {escalate}
        </CardButton>
        <CardButton
          tone="ghost"
          onClick={() => alert(`Open discussion thread on ${row.id}.`)}
        >
          Discuss
        </CardButton>
      </div>
    </li>
  );
}

function CardButton({
  tone,
  onClick,
  children,
}: {
  tone: "primary" | "warning" | "ghost";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base =
    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors";
  const styles: Record<string, string> = {
    primary: "bg-ink text-paper hover:bg-accent",
    warning: "bg-orange-100 text-orange-800 hover:bg-orange-200",
    ghost:
      "border border-paper-line bg-paper-card text-ink-mid hover:bg-paper-warm hover:text-ink",
  };
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[tone]}`}>
      {children}
    </button>
  );
}
