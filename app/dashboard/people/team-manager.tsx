"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = "active" | "pending" | "suspended";
type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: Status;
  lastSignIn: string | null;
  isSelf: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Org admin",
  manager: "Manager",
  viewer: "Viewer",
  field: "Field worker",
  member: "Member",
};
const ROLE_OPTIONS = ["org_admin", "manager", "viewer", "field", "member"];

type Invite = {
  id: string;
  token: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
};

function inviteUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.keldra.io";
  return `${origin}/join/${token}`;
}

export default function TeamManager() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // invite by email
  const [iName, setIName] = useState("");
  const [iEmail, setIEmail] = useState("");
  const [iKind, setIKind] = useState<"dashboard" | "field">("dashboard");
  const [iDashRole, setIDashRole] = useState<"org_admin" | "manager" | "viewer">("manager");
  const [iSending, setISending] = useState(false);

  // join links
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 4000);
  }, []);

  const loadPeople = useCallback(async () => {
    const res = await fetch("/api/team");
    const data = (await res.json().catch(() => ({}))) as { people?: Person[]; error?: string };
    if (res.ok) setPeople(data.people ?? []);
    else flash("err", data.error ?? "Couldn't load the team.");
  }, [flash]);

  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/invites");
    const data = (await res.json().catch(() => ({}))) as { invites?: Invite[] };
    if (res.ok) setInvites(data.invites ?? []);
  }, []);

  useEffect(() => {
    void loadPeople();
    void loadInvites();
  }, [loadPeople, loadInvites]);

  async function act(p: Person, action: string, role?: string) {
    if (action === "remove" && !window.confirm(`Remove ${p.name}? Access is revoked permanently. Their field captures, emails and task events stay on the record, attributed to them.`)) return;
    if (action === "cancel" && !window.confirm(`Cancel the invite for ${p.email}? They'll be deleted entirely.`)) return;
    setBusy(p.id);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: p.id, action, role }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(null);
    if (!res.ok) {
      flash("err", data.error ?? "Action failed.");
      return;
    }
    flash("ok", data.message ?? "Done.");
    void loadPeople();
  }

  async function invite() {
    setISending(true);
    const role = iKind === "field" ? "field" : iDashRole;
    const res = await fetch("/api/invites/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: iName, email: iEmail, role }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setISending(false);
    if (!res.ok) {
      flash("err", data.error ?? "Couldn't send invite.");
      return;
    }
    flash("ok", data.message ?? `Invite sent to ${iEmail}.`);
    setIName("");
    setIEmail("");
    void loadPeople();
  }

  async function createLink() {
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    const data = (await res.json().catch(() => ({}))) as { invite?: Invite; error?: string };
    if (!res.ok || !data.invite) {
      flash("err", data.error ?? "Couldn't create link.");
      return;
    }
    setInvites((cur) => [data.invite!, ...cur]);
    void copy(data.invite.token);
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch {
      /* ignore */
    }
  }

  async function revokeLink(id: string) {
    const res = await fetch("/api/invites/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setInvites((cur) => cur.map((i) => (i.id === id ? { ...i, expires_at: new Date().toISOString() } : i)));
  }

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
  const input =
    "w-full rounded-xl border border-border-soft bg-paper-card px-3 py-2.5 text-sm text-ink outline-none focus:border-accent";
  const linkActive = (i: Invite) =>
    !(i.expires_at && new Date(i.expires_at) <= new Date()) &&
    !(i.max_uses != null && i.use_count >= i.max_uses);

  return (
    <main className="mx-auto max-w-4xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>
      <h1
        className="mt-4 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.15 }}
      >
        Team
      </h1>
      <p className="mt-1 text-sm text-ink-mid">
        Manage who can access {""}your organisation. Removing access never rewrites
        history — captures, emails and task events stay attributed.
      </p>

      {toast && (
        <div
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm ${toast.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
        >
          {toast.text}
        </div>
      )}

      {/* Team list */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-paper-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-warm text-[11px] uppercase tracking-wide text-ink-mid">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Last sign-in</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people === null ? (
              <tr><td className="px-4 py-4 text-ink-mid" colSpan={5}>Loading…</td></tr>
            ) : people.length === 0 ? (
              <tr><td className="px-4 py-4 text-ink-mid" colSpan={5}>No team members yet.</td></tr>
            ) : (
              people.map((p) => (
                <tr key={p.id} className="border-t border-paper-line align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.name}{p.isSelf ? " (you)" : ""}</p>
                    <p className="text-[11px] text-ink-mid break-all">{p.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.role}
                      disabled={busy === p.id}
                      onChange={(e) => act(p, "role", e.target.value)}
                      className="rounded-lg border border-border-soft bg-paper-card px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.status === "active" ? "Active" : p.status === "pending" ? "Pending" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-mid">{fmtDate(p.lastSignIn)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {p.status === "pending" && (
                        <>
                          <ActionBtn onClick={() => act(p, "resend")} busy={busy === p.id}>Resend</ActionBtn>
                          <ActionBtn onClick={() => act(p, "cancel")} busy={busy === p.id} danger>Cancel</ActionBtn>
                        </>
                      )}
                      {p.status === "active" && !p.isSelf && (
                        <ActionBtn onClick={() => act(p, "suspend")} busy={busy === p.id}>Suspend</ActionBtn>
                      )}
                      {p.status === "suspended" && (
                        <ActionBtn onClick={() => act(p, "reactivate")} busy={busy === p.id}>Reactivate</ActionBtn>
                      )}
                      {p.status !== "pending" && !p.isSelf && (
                        <ActionBtn onClick={() => act(p, "remove")} busy={busy === p.id} danger>Remove</ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite by email */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-ink">Add person by email</h2>
        <p className="mt-0.5 text-[12px] text-ink-mid">
          They get an email, set a password, and land straight in their workspace.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={iName} onChange={(e) => setIName(e.target.value)} placeholder="Name" className={input} />
          <input type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} placeholder="Email" className={input} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
          <button type="button" onClick={() => setIKind("dashboard")} className={`rounded-xl border px-3 py-2 text-sm font-medium ${iKind === "dashboard" ? "border-accent bg-accent/5 text-ink" : "border-paper-line text-ink-mid"}`}>Dashboard access</button>
          <button type="button" onClick={() => setIKind("field")} className={`rounded-xl border px-3 py-2 text-sm font-medium ${iKind === "field" ? "border-accent bg-accent/5 text-ink" : "border-paper-line text-ink-mid"}`}>Field app</button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {iKind === "dashboard" && (
            <select value={iDashRole} onChange={(e) => setIDashRole(e.target.value as "org_admin" | "manager" | "viewer")} className={`${input} sm:max-w-[200px]`}>
              <option value="org_admin">Org admin</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
          <button type="button" onClick={invite} disabled={iSending || !iEmail.trim()} className="ml-auto rounded-xl bg-ink px-5 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-60">
            {iSending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </section>

      {/* Shareable join link */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Shareable join link</h2>
          <button type="button" onClick={createLink} className="rounded-xl border border-paper-line px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent">
            Generate link
          </button>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-mid">For bulk / WhatsApp invites — anyone with the link can join as a member.</p>
        {invites.length > 0 && (
          <ul className="mt-3 space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-paper-line bg-paper p-3">
                <code className="truncate text-xs text-ink-mid">{inviteUrl(i.token)}</code>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-[11px] text-ink-mid">{i.use_count}{i.max_uses != null ? `/${i.max_uses}` : ""} used</span>
                  <button type="button" onClick={() => copy(i.token)} className="rounded-lg border border-paper-line px-2.5 py-1 text-xs text-ink hover:border-accent hover:text-accent">{copied === i.token ? "Copied" : "Copy"}</button>
                  {linkActive(i) && (
                    <button type="button" onClick={() => revokeLink(i.id)} className="rounded-lg border border-paper-line px-2.5 py-1 text-xs text-red-600 hover:border-red-300">Revoke</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ActionBtn({
  children,
  onClick,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "border-paper-line text-red-600 hover:border-red-300 hover:bg-red-50"
          : "border-paper-line text-ink hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
