"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FIELD_PERSONA, inboxMessages, personaBlockers } from "./field-persona";
import MyFieldTasks from "./my-tasks";

const SIGNIN_KEY = "keldra_field_signin";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

function k(n: number): string {
  return `£${Math.round(n / 1000)}k`;
}

// Seeded walks for the day — the foreman's planned site rounds.
const WALKS = [
  { room: "MMR1", what: "Check brackets bay — fibre runs" },
  { room: "COLO 1-4", what: "Containment second fix progress" },
  { room: "BU-FER", what: "Generator A laydown area" },
];

export default function FieldHome() {
  const [mounted, setMounted] = useState(false);
  const [signedInAt, setSignedInAt] = useState<string | null>(null);
  const [walksOpen, setWalksOpen] = useState(false);

  // Authenticated org users get their real assigned-tasks view; the anonymous
  // public demo keeps the persona experience untouched.
  const [realUser, setRealUser] = useState<{ name: string | null } | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setRealUser(null);
          return;
        }
        const { data } = await supabase
          .from("users")
          .select("full_name, org_id")
          .eq("id", user.id)
          .maybeSingle();
        setRealUser(data?.org_id ? { name: (data.full_name as string | null) ?? null } : null);
      } catch {
        setRealUser(null);
      }
    })();
  }, []);

  const [blockerCount, setBlockerCount] = useState(0);
  const [blockerBurn, setBlockerBurn] = useState(0);
  const [newMessages, setNewMessages] = useState(0);
  const [formalUnopened, setFormalUnopened] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setSignedInAt(localStorage.getItem(SIGNIN_KEY));
    } catch {
      // ignore
    }
    const blockers = personaBlockers();
    setBlockerCount(blockers.length);
    setBlockerBurn(blockers.reduce((s, t) => s + t.cost_per_day, 0));

    const { regular, formal } = inboxMessages();
    setNewMessages(Math.min(2, regular.length));
    setFormalUnopened(!!formal);
  }, []);

  function signIn() {
    const now = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    try {
      localStorage.setItem(SIGNIN_KEY, now);
    } catch {
      // ignore
    }
    setSignedInAt(now);
  }

  // Real authenticated org users → assigned-tasks view; anon demo → persona.
  if (realUser === undefined) return null;
  if (realUser) return <MyFieldTasks name={realUser.name} />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-deep">
          MER · {FIELD_PERSONA.companyName}
        </p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 30, lineHeight: 1.1 }}
        >
          {greeting()}, {FIELD_PERSONA.firstName}
        </h1>
      </header>

      <div className="space-y-3">
        {/* Walks today — tappable, expands to the round */}
        <button
          type="button"
          onClick={() => setWalksOpen((v) => !v)}
          className="block w-full rounded-2xl border border-paper-line bg-paper-card p-5 text-left active:bg-paper-warm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Your walks today
              </p>
              <p
                className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 32, lineHeight: 1 }}
              >
                {WALKS.length}
              </p>
              <p className="mt-1 text-xs text-ink-mid">Planned site walks</p>
            </div>
            <span className="text-2xl text-ink-mid">{walksOpen ? "⌄" : "›"}</span>
          </div>
          {walksOpen && (
            <ul className="mt-3 space-y-2 border-t border-paper-line pt-3">
              {WALKS.map((w, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-mono text-[11px] text-accent-deep">
                    {w.room}
                  </span>
                  <span className="text-ink-mid">{w.what}</span>
                </li>
              ))}
            </ul>
          )}
        </button>

        {/* Blockers — tappable */}
        <Link href="/field/blockers" className="block">
          <div className="flex items-center justify-between rounded-2xl border border-paper-line bg-paper-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Your blockers
              </p>
              <p
                className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 32, lineHeight: 1 }}
              >
                {mounted ? blockerCount : "—"}
              </p>
              <p className="mt-1 text-xs text-ink-mid">
                {mounted && blockerCount > 0
                  ? `Open, costing ${k(blockerBurn)}/day combined`
                  : "Open across your project"}
              </p>
            </div>
            <span className="text-2xl text-ink-mid">›</span>
          </div>
        </Link>

        {/* Messages — the key inbound surface */}
        <Link href="/field/inbox" className="block">
          <div className="flex items-center justify-between rounded-2xl border border-paper-line bg-paper-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
                Messages
                {mounted && newMessages > 0 && (
                  <span className="ml-2 rounded-full bg-accent-deep px-1.5 py-0.5 text-[10px] font-bold text-paper">
                    {newMessages} NEW
                  </span>
                )}
              </p>
              <p className="mt-2 text-sm text-ink">
                Chases from Commissioning Lead — reply here, in Keldra.
              </p>
              {mounted && formalUnopened && (
                <p className="mt-1.5 text-xs font-semibold text-red-700">
                  ⚠ 1 formal escalation unopened
                </p>
              )}
            </div>
            <span className="text-2xl text-ink-mid">›</span>
          </div>
        </Link>

        {/* Sign in to site — geofence move */}
        <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Sign in to site
          </p>
          {mounted && signedInAt ? (
            <p
              className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1.1 }}
            >
              ✓ Signed in at {signedInAt}
            </p>
          ) : (
            <button
              type="button"
              onClick={signIn}
              className="mt-3 min-h-[48px] w-full rounded-xl border-2 border-accent-deep px-5 text-sm font-semibold text-accent-deep transition-colors active:bg-accent/10"
            >
              📍 Sign in to site
            </button>
          )}
        </div>
      </div>

      <Link
        href="/field/log"
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent-deep px-6 text-base font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(94,37,163,0.6)] active:bg-accent"
      >
        <span aria-hidden>+</span> Log blocker or update
      </Link>

      <p className="text-center">
        <Link href="/field/profile" className="text-xs text-ink-mid underline">
          Profile &amp; settings
        </Link>
      </p>
    </div>
  );
}
