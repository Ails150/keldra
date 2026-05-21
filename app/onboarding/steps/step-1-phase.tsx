"use client";

import type { StepProps } from "../types";

const PHASES = [
  {
    id: "pre-construction",
    eyebrow: "Phase 1",
    name: "Pre-construction",
    description: "Designs locked, baseline programme set, no boots on site yet.",
    meta: "You'll set up: design packages, baseline programme, key dates.",
  },
  {
    id: "mid-construction",
    eyebrow: "Phase 2",
    name: "Mid-construction",
    description: "Crews on site, install in progress, daily coordination live.",
    meta: "You'll set up: trades, headcount, blockers, daily % complete.",
  },
  {
    id: "commissioning",
    eyebrow: "Phase 3",
    name: "Commissioning",
    description: "Systems being energised. Red-tag to green-tag flow active.",
    meta: "You'll set up: asset register, FOK criteria, red/yellow/green tags.",
  },
  {
    id: "handover",
    eyebrow: "Phase 4",
    name: "Handover",
    description: "Snags being closed, O&M docs being collated, client walk-arounds.",
    meta: "You'll set up: punch list, sign-off matrix, document hand-back.",
  },
];

export default function Step1Phase({ formData, setFormData }: StepProps) {
  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8 text-center">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 40, lineHeight: 1.1 }}
        >
          Where is your project today?
        </h1>
        <p
          className="mt-3 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 18 }}
        >
          Pick the phase you're starting Keldra in. We'll only show you what matters now.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PHASES.map((p) => {
          const selected = formData.phase === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, phase: p.id }))
              }
              className={`relative rounded-2xl border p-6 text-left transition-all ${
                selected
                  ? "border-accent bg-[color:var(--accent)]/5 shadow-[0_4px_24px_-8px_rgba(138,61,214,0.3)]"
                  : "border-paper-line bg-paper-card hover:border-border-soft hover:shadow-sm"
              }`}
            >
              {selected && (
                <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-paper text-sm font-bold">
                  ✓
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                {p.eyebrow}
              </span>
              <h3
                className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                style={{ fontSize: 24, lineHeight: 1.2 }}
              >
                {p.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-mid">
                {p.description}
              </p>
              <p className="mt-4 border-t border-paper-line pt-3 text-xs text-ink-mid">
                {p.meta}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
