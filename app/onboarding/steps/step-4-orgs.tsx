"use client";

import { useState } from "react";
import type { StepProps, OrgEntry } from "../types";

const ROLE_OPTIONS = [
  "Subcontractor",
  "Subcontractor (MEP)",
  "Main contractor",
  "General contractor",
  "Commissioning",
  "Design house",
  "Client",
];

const FALLBACK_COLOURS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#0f766e",
];

function initialsFor(name: string) {
  const cleaned = name.trim().replace(/[^a-zA-Z ]/g, "");
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? "")).toUpperCase();
}

export default function Step4Orgs({ formData, setFormData }: StepProps) {
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState(ROLE_OPTIONS[0]);

  function addOrg() {
    const name = newName.trim();
    if (!name) return;
    const colour =
      FALLBACK_COLOURS[formData.otherOrgs.length % FALLBACK_COLOURS.length];
    const entry: OrgEntry = {
      id: `org-${Date.now()}`,
      name,
      role: newRole,
      initials: initialsFor(name),
      colour,
    };
    setFormData((prev) => ({ ...prev, otherOrgs: [...prev.otherOrgs, entry] }));
    setNewName("");
  }

  function removeOrg(id: string) {
    setFormData((prev) => ({
      ...prev,
      otherOrgs: prev.otherOrgs.filter((o) => o.id !== id),
    }));
  }

  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          Who else is on the project?
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          The other companies in the delivery chain. We'll send them invites in the next step.
        </p>
      </header>

      <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
        <ul className="divide-y divide-paper-line">
          {formData.otherOrgs.map((o) => (
            <li key={o.id} className="flex items-center gap-4 px-5 py-4">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-paper font-semibold text-sm"
                style={{ backgroundColor: o.colour }}
              >
                {o.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink truncate">
                  {o.name}
                  {o.isYou && (
                    <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-deep">
                      YOU
                    </span>
                  )}
                </p>
                <p className="text-sm text-ink-mid">{o.role}</p>
              </div>
              {!o.isYou && (
                <button
                  type="button"
                  onClick={() => removeOrg(o.id)}
                  className="text-sm text-ink-mid hover:text-red-600 transition-colors"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-paper-line bg-paper-warm px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-mid mb-3">
            Add another organisation
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOrg()}
              placeholder="Organisation name"
              className="flex-1 rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
              style={{ height: 44, fontSize: 14 }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="rounded-xl border border-border-soft bg-paper-card px-3 text-ink outline-none focus:border-accent transition-colors"
              style={{ height: 44, fontSize: 14 }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addOrg}
              disabled={!newName.trim()}
              className="rounded-xl bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ height: 44 }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
