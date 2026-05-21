"use client";

import type { StepProps } from "../types";

const TEMPLATES = [
  {
    id: "mercury-red-tag",
    name: "Mercury Red Tag v1",
    description: "Mercury's MEP commissioning pipeline. Asset-level red/yellow/green tagging with ready-criteria gates.",
    stages: ["Designed", "Delivered", "Installed", "Red-tag candidate", "Red-tagged", "Yellow", "Green"],
    recommended: true,
  },
  {
    id: "hyperscaler-cx-standard",
    name: "Hyperscaler Cx Standard",
    description: "Generic data-centre commissioning template. Asset register + FOK criteria + IST/L5 sign-off.",
    stages: ["Designed", "Procured", "Installed", "Cold Cx", "Hot Cx", "IST", "L5 sign-off"],
    recommended: false,
  },
  {
    id: "modular-plant-room",
    name: "Modular Plant Room v1",
    description: "For skid-delivered MEP. Factory test → site connect → commissioning → handover.",
    stages: ["Designed", "Factory tested", "Delivered", "Sited", "Connected", "Commissioned", "Handed over"],
    recommended: false,
  },
  {
    id: "custom",
    name: "Build your own",
    description: "Start from a blank stage chain and add your own stages, criteria and tags later.",
    stages: ["Custom stages — set up after onboarding"],
    recommended: false,
  },
];

const UPLOAD_CARDS = [
  {
    id: "team",
    title: "Team roster",
    desc: "People, roles, org assignments",
    count: "12 people imported",
  },
  {
    id: "assets",
    title: "Asset register",
    desc: "Equipment list with tags + locations",
    count: "247 assets imported",
  },
  {
    id: "constraints",
    title: "Constraint log",
    desc: "Open items, blockers, dependencies",
    count: "9 constraints imported",
  },
];

const CONSTRAINT_ROWS = [
  { id: "C-001", title: "AHU-04 flashing detail awaiting client signoff", owner: "Owner unclear", date: "12 Nov" },
  { id: "C-002", title: "Cable tray route conflicts with structural beam in B-block", owner: "Lawrence Burke", date: "14 Nov" },
  { id: "C-003", title: "Switchgear delivery delayed — vendor confirmation pending", owner: "Owner unclear", date: "18 Nov" },
  { id: "C-004", title: "Roof-deck penetration sealing detail TBD", owner: "Conor Murphy", date: "21 Nov" },
  { id: "C-005", title: "Fire damper actuator spec mismatch with mech schedule", owner: "Owner unclear", date: "22 Nov" },
];

export default function Step5Templates({ formData, setFormData }: StepProps) {
  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          Pick a template + bring in your data
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          We'll wire the stages, then import your roster, assets and open constraints.
        </p>
      </header>

      <div className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
          Choose a template
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => {
            const selected = formData.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, template: t.id }))
                }
                className={`relative rounded-2xl border p-5 text-left transition-all ${
                  selected
                    ? "border-accent bg-[color:var(--accent)]/5 shadow-[0_4px_24px_-8px_rgba(138,61,214,0.3)]"
                    : "border-paper-line bg-paper-card hover:border-border-soft"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-ink">{t.name}</h3>
                      {t.recommended && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-deep">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">
                      {t.description}
                    </p>
                  </div>
                  {selected && (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-paper text-xs font-bold">
                      ✓
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-mid">
                  {t.stages.map((s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="rounded-full bg-paper-warm px-2 py-1 text-ink">
                        {s}
                      </span>
                      {i < t.stages.length - 1 && (
                        <span className="text-ink-mid/60">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
          Bring in your data
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {UPLOAD_CARDS.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-green-200 bg-green-50/60 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white text-xs font-bold">
                  ✓
                </span>
                <p className="font-medium text-ink text-sm">{u.title}</p>
              </div>
              <p className="mt-1 text-xs text-ink-mid">{u.desc}</p>
              <p className="mt-3 text-xs font-medium text-green-700">
                {u.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-3">
          Preview · constraint log
        </h2>
        <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper-warm text-xs font-medium uppercase tracking-wide text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Constraint</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-line">
              {CONSTRAINT_ROWS.map((r) => {
                const ownerless = r.owner === "Owner unclear";
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-mid">
                      {r.id}
                    </td>
                    <td className="px-4 py-3 text-ink">{r.title}</td>
                    <td className="px-4 py-3">
                      {ownerless ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          {r.owner}
                        </span>
                      ) : (
                        <span className="text-ink-mid">{r.owner}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-mid">{r.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <span className="text-lg">⚠️</span>
          <p className="text-red-800">
            <span className="font-semibold">3 constraints have no owner</span>
            <span className="text-red-700"> — Keldra has tagged them </span>
            <span className="font-semibold">Owner unclear</span>
            <span className="text-red-700">. Assign them after onboarding.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
