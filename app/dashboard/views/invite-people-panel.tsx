"use client";

import { useCallback, useEffect, useState } from "react";

type Invite = {
  id: string;
  token: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Org admin",
  manager: "Manager",
  viewer: "Viewer",
  field: "Field worker",
  member: "Member",
};

function inviteUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://app.keldra.io";
  return `${origin}/join/${token}`;
}

function statusOf(inv: Invite): { label: string; tone: "live" | "spent" | "expired" } {
  if (inv.expires_at && new Date(inv.expires_at) <= new Date())
    return { label: "Revoked / expired", tone: "expired" };
  if (inv.max_uses != null && inv.use_count >= inv.max_uses)
    return { label: "Fully used", tone: "spent" };
  return { label: "Active", tone: "live" };
}

export default function InvitePeoplePanel({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Two invite paths: dashboard access (with a role picker) or field-app access
  // (role fixed to "field", deliberately simple).
  const [kind, setKind] = useState<"dashboard" | "field">("dashboard");
  const [dashRole, setDashRole] = useState<"org_admin" | "manager" | "viewer">("manager");
  const role = kind === "field" ? "field" : dashRole;
  const [maxUses, setMaxUses] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/invites");
    const data = (await res.json().catch(() => ({}))) as {
      invites?: Invite[];
      error?: string;
    };
    if (!res.ok) {
      setLoadError(data.error ?? "Couldn't load invites.");
      setInvites([]);
      return;
    }
    setInvites(data.invites ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      invite?: Invite;
      error?: string;
    };
    setCreating(false);
    if (!res.ok || !data.invite) {
      setCreateError(data.error ?? "Couldn't create the invite.");
      return;
    }
    setInvites((cur) => [data.invite!, ...(cur ?? [])]);
    setMaxUses("");
    setExpiresInDays("");
    void copy(data.invite.token);
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  async function revoke(id: string) {
    const res = await fetch("/api/invites/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setInvites((cur) =>
        (cur ?? []).map((i) =>
          i.id === id ? { ...i, expires_at: new Date().toISOString() } : i,
        ),
      );
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4 py-10">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-50 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-paper-line bg-paper-card shadow-[0_20px_60px_-20px_rgba(26,15,43,0.4)]">
        <div className="flex items-start justify-between border-b border-paper-line p-6">
          <div>
            <h2
              className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1.2 }}
            >
              Invite people
            </h2>
            <p className="mt-1 text-sm text-ink-mid">
              Generate a join link for your organisation. Anyone with the link can
              create an account in your org.
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

        <div className="overflow-y-auto p-6">
          {/* Create */}
          <div className="rounded-xl border border-paper-line bg-paper p-4">
            {/* What the link grants */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("dashboard")}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  kind === "dashboard"
                    ? "border-accent bg-accent/5"
                    : "border-paper-line hover:border-accent/50"
                }`}
              >
                <p className="text-sm font-semibold text-ink">Dashboard access</p>
                <p className="text-[11px] text-ink-mid">Full web dashboard</p>
              </button>
              <button
                type="button"
                onClick={() => setKind("field")}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  kind === "field"
                    ? "border-accent bg-accent/5"
                    : "border-paper-line hover:border-accent/50"
                }`}
              >
                <p className="text-sm font-semibold text-ink">Field app access</p>
                <p className="text-[11px] text-ink-mid">Field capture app on their phone</p>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-mid">
                  Role
                </label>
                {kind === "dashboard" ? (
                  <select
                    value={dashRole}
                    onChange={(e) =>
                      setDashRole(e.target.value as "org_admin" | "manager" | "viewer")
                    }
                    className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  >
                    <option value="org_admin">Org admin</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <div className="rounded-xl border border-border-soft bg-paper px-3 py-2.5 text-sm text-ink-mid">
                    Field worker
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-mid">
                  Max uses
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-mid">
                  Expires (days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="Never"
                  className="w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              {createError ? (
                <p className="text-sm text-red-600">{createError}</p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={create}
                disabled={creating}
                className="rounded-xl bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-60"
              >
                {creating ? "Generating…" : "Generate link"}
              </button>
            </div>
          </div>

          {/* List */}
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Existing invites
          </h3>
          {loadError && <p className="mt-2 text-sm text-red-600">{loadError}</p>}
          {invites === null ? (
            <p className="mt-3 text-sm text-ink-mid">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="mt-3 text-sm text-ink-mid">No invites yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {invites.map((inv) => {
                const status = statusOf(inv);
                const active = status.tone === "live";
                return (
                  <li
                    key={inv.id}
                    className="rounded-xl border border-paper-line bg-paper p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <code className="truncate text-xs text-ink-mid">
                        {inviteUrl(inv.token)}
                      </code>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copy(inv.token)}
                          className="rounded-lg border border-paper-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                        >
                          {copied === inv.token ? "Copied" : "Copy"}
                        </button>
                        {active && (
                          <button
                            type="button"
                            onClick={() => revoke(inv.id)}
                            className="rounded-lg border border-paper-line px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-mid">
                      <span className="font-medium text-ink">{ROLE_LABELS[inv.role] ?? inv.role}</span>
                      <span>·</span>
                      <span>
                        {inv.use_count}
                        {inv.max_uses != null ? ` / ${inv.max_uses}` : ""} used
                      </span>
                      <span>·</span>
                      <span
                        className={
                          status.tone === "live"
                            ? "text-emerald-600"
                            : status.tone === "expired"
                              ? "text-red-600"
                              : "text-ink-mid"
                        }
                      >
                        {status.label}
                      </span>
                      {inv.expires_at && status.tone === "live" && (
                        <>
                          <span>·</span>
                          <span>
                            expires{" "}
                            {new Date(inv.expires_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
