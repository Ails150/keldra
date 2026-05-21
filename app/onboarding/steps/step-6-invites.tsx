"use client";

import type { StepProps } from "../types";

export default function Step6Invites({ formData }: StepProps) {
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
          We've pulled these out of your team roster. Review and finish — they'll get a magic link.
        </p>
      </header>

      <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
        <ul className="divide-y divide-paper-line">
          {formData.invites.map((p) => (
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

        <div className="border-t border-paper-line bg-paper-warm px-5 py-3 text-center text-xs font-medium uppercase tracking-wide text-ink-mid">
          + 7 more
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-paper-line bg-paper-card p-6 md:grid-cols-4">
        <div className="text-center">
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 36, lineHeight: 1 }}
          >
            5
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
            12
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
            247
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
            9
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-mid">
            Constraints
          </p>
        </div>
      </div>
    </section>
  );
}
