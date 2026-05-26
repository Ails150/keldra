"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useField } from "./use-field";
import { isOpen } from "../dashboard/lib/blocker-state";

const SIGNIN_KEY = "keldra_field_signin";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

export default function FieldHome() {
  const { project, blockerMap, name } = useField();
  const [signedInAt, setSignedInAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSignedInAt(localStorage.getItem(SIGNIN_KEY));
    } catch {
      // ignore
    }
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

  if (project === undefined) {
    return <p className="pt-10 text-center text-sm text-ink-mid">Loading…</p>;
  }
  if (project === null) {
    return (
      <div className="pt-10 text-center">
        <p className="text-sm text-ink-mid">
          No project set up yet. Run onboarding on the dashboard first.
        </p>
        <Link
          href="/onboarding"
          className="mt-4 inline-block rounded-xl bg-accent-deep px-5 py-3 text-sm font-medium text-paper"
        >
          Go to setup
        </Link>
      </div>
    );
  }

  const openBlockers = blockerMap
    ? Object.values(blockerMap).filter(isOpen).length
    : 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-deep">
          {project.project.name || "Field"}
        </p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 30, lineHeight: 1.1 }}
        >
          {greeting()}, {name}
        </h1>
      </header>

      <div className="space-y-3">
        <BigCard
          label="Your walks today"
          value="3"
          sub="Planned site walks"
        />
        <Link href="/field/blockers" className="block">
          <BigCard
            label="Your blockers"
            value={`${openBlockers}`}
            sub="Open across your project"
            chevron
          />
        </Link>
        <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
            Your sign-ins
          </p>
          {signedInAt ? (
            <p
              className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1.1 }}
            >
              Signed in at {signedInAt}
            </p>
          ) : (
            <button
              type="button"
              onClick={signIn}
              className="mt-3 min-h-[48px] w-full rounded-xl border-2 border-accent-deep px-5 text-sm font-semibold text-accent-deep transition-colors active:bg-accent/10"
            >
              Sign in to site
            </button>
          )}
        </div>
      </div>

      <Link
        href="/field/capture"
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent-deep px-6 text-base font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(94,37,163,0.6)] active:bg-accent"
      >
        <span aria-hidden>◎</span> Voice note + photo
      </Link>
    </div>
  );
}

function BigCard({
  label,
  value,
  sub,
  chevron,
}: {
  label: string;
  value: string;
  sub?: string;
  chevron?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-paper-line bg-paper-card p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
          {label}
        </p>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1 }}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-ink-mid">{sub}</p>}
      </div>
      {chevron && <span className="text-2xl text-ink-mid">›</span>}
    </div>
  );
}
