"use client";

import { useState } from "react";
import type { ViewingRole } from "../../onboarding/types";
import { roleLabel } from "../utils";

const ORG_SUGGESTIONS = [
  "Mercury Engineering",
  "Ardmac",
  "Central Design",
  "Primo Power",
  "Hyperscaler X",
  "Other",
];

const ROLES: { id: ViewingRole; label: string }[] = [
  { id: "main-contractor", label: "Main contractor" },
  { id: "subcontractor", label: "Subcontractor" },
  { id: "design", label: "Design" },
  { id: "client", label: "Client" },
];

export default function InviteOrgModal({
  activeRole,
  onClose,
}: {
  activeRole: ViewingRole;
  onClose: () => void;
}) {
  const [org, setOrg] = useState(ORG_SUGGESTIONS[1]);
  const [role, setRole] = useState<ViewingRole>(
    activeRole === "main-contractor" ? "subcontractor" : "main-contractor",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function send() {
    const target = email.trim() || "their inbox";
    alert(
      `Magic link would send to ${target} — they'd land in their ${roleLabel(role)} view of this project.`,
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4 py-10">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-50 w-full max-w-lg rounded-2xl border border-paper-line bg-paper-card p-6 shadow-[0_20px_60px_-20px_rgba(26,15,43,0.4)]">
        <div className="flex items-start justify-between">
          <div>
            <h2
              className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1.2 }}
            >
              Tag in another organisation
            </h2>
            <p className="mt-1 text-sm text-ink-mid">
              They&apos;ll get a magic link and land directly in their role&apos;s view.
            </p>
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

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-mid mb-1.5">
                Organisation
              </label>
              <select
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              >
                {ORG_SUGGESTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ink-mid mb-1.5">
                Their role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ViewingRole)}
                className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-mid mb-1.5">
              Primary contact — name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lawrence Burke"
              className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-mid mb-1.5">
              Primary contact — email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@org.com"
              className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-paper-line bg-paper-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-warm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent"
          >
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
