"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import { deriveOrgColour, getInitials, roleLabel } from "../utils";

type Promise = {
  id: string;
  what: string;
  from: { name: string; org: string };
  to: { name: string; org: string };
  due: string;
  status: "overdue" | "due-today" | "kept" | "open";
  scope?: "client";
};

const SAMPLE: Promise[] = [
  {
    id: "P-1421",
    what: "Rev D drawing — MER1 containment",
    from: { name: "Lawrence Burke", org: "Ardmac" },
    to: { name: "Johnny McKenna", org: "Mercury" },
    due: "Was: Mon 18 May",
    status: "overdue",
  },
  {
    id: "P-1438",
    what: "MER1-UPM-01 commissioning slot confirmation",
    from: { name: "Patrick O'Neill", org: "Mercury" },
    to: { name: "Sarah Kennedy", org: "Hyperscaler X" },
    due: "Today 14:00",
    status: "due-today",
    scope: "client",
  },
  {
    id: "P-1402",
    what: "Snag-list close-out — Colo Hall 2",
    from: { name: "Cormac Daly", org: "Ardmac" },
    to: { name: "Johnny McKenna", org: "Mercury" },
    due: "Kept — yesterday",
    status: "kept",
  },
];

const STATUS: Record<Promise["status"], { dot: string; pill: string; label: string }> = {
  overdue: { dot: "bg-red-500", pill: "bg-red-100 text-red-700", label: "Overdue" },
  "due-today": { dot: "bg-yellow-500", pill: "bg-yellow-100 text-yellow-800", label: "Due today" },
  kept: { dot: "bg-green-500", pill: "bg-green-100 text-green-800", label: "Kept" },
  open: { dot: "bg-blue-500", pill: "bg-blue-100 text-blue-800", label: "Open" },
};

function filterPromises(role: ViewingAs["role"]): Promise[] {
  switch (role) {
    case "subcontractor":
      return SAMPLE.filter(
        (p) => p.from.org === "Ardmac" || p.to.org === "Ardmac",
      );
    case "client":
      return SAMPLE.filter((p) => p.scope === "client" || p.to.org === "Hyperscaler X");
    case "design":
      return SAMPLE.filter(
        (p) => p.from.org === "Central Design" || p.to.org === "Central Design",
      );
    default:
      return SAMPLE;
  }
}

export default function PromisesView({
  project: _project,
  viewingAs,
}: {
  project: WizardData;
  viewingAs: ViewingAs;
}) {
  const promises = filterPromises(viewingAs.role);

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Promises
        </h1>
        <p className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid" style={{ fontSize: 16 }}>
          Cross-org promises in your {roleLabel(viewingAs.role)} view.
        </p>
      </header>

      {promises.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-line bg-paper-card p-10 text-center text-sm text-ink-mid">
          No promises relevant to this view yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {promises.map((p) => {
            const s = STATUS[p.status];
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-paper-line bg-paper-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
                      <p className="font-mono text-xs text-ink-mid">{p.id}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.pill}`}>
                        {s.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink">{p.what}</p>
                  </div>
                  <span className="text-xs font-medium text-ink-mid">{p.due}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-mid">
                  <Party label="From" name={p.from.name} org={p.from.org} />
                  <span className="opacity-50">→</span>
                  <Party label="To" name={p.to.name} org={p.to.org} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Party({
  label,
  name,
  org,
}: {
  label: string;
  name: string;
  org: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="opacity-60">{label}:</span>
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-paper"
        style={{ backgroundColor: deriveOrgColour(org) }}
      >
        {getInitials(name)}
      </span>
      <span className="font-medium text-ink">{name}</span>
      <span className="opacity-70">· {org}</span>
    </span>
  );
}
