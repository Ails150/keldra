"use client";

import type { StepProps } from "../types";

const ORG_TYPES = [
  { id: "main-contractor", label: "Main contractor", desc: "Lead delivery party" },
  { id: "gc", label: "General contractor", desc: "Tier 1 — runs the site" },
  { id: "subcontractor", label: "Subcontractor", desc: "MEP, civils, fabric, etc." },
  { id: "commissioning", label: "Commissioning", desc: "Cx provider or Cx lead" },
  { id: "design", label: "Design house", desc: "Engineering / design partner" },
  { id: "client", label: "Client / Owner", desc: "Hyperscaler, pharma, gov" },
];

const COLOUR_SWATCHES = [
  "#8a3dd6",
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#7c3aed",
];

const PHASE_LABELS: Record<string, string> = {
  "pre-construction": "Pre-construction",
  "mid-construction": "Mid-construction",
  commissioning: "Commissioning",
  handover: "Handover",
};

export default function Step2Organisation({ formData, setFormData, jumpTo }: StepProps) {
  return (
    <section className="mx-auto max-w-5xl px-8">
      <div className="mb-6 flex items-center justify-between rounded-xl border border-paper-line bg-paper-warm px-5 py-3 text-sm">
        <span className="text-ink-mid">
          Phase: <span className="font-medium text-ink">{formData.phase ? PHASE_LABELS[formData.phase] : "—"}</span>
        </span>
        <button
          type="button"
          onClick={() => jumpTo?.(1)}
          className="text-accent font-medium hover:underline"
        >
          Change
        </button>
      </div>

      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          Tell us about your organisation
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          The org you're logging in on behalf of. You can invite others in a moment.
        </p>
      </header>

      <div className="space-y-8">
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Organisation name
          </label>
          <input
            type="text"
            value={formData.org.name}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                org: { ...prev.org, name: e.target.value },
              }))
            }
            placeholder="e.g. Ardmac"
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-ink mb-3">
            What kind of organisation are you?
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {ORG_TYPES.map((t) => {
              const selected = formData.org.type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      org: { ...prev.org, type: t.id },
                    }))
                  }
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    selected
                      ? "border-accent bg-[color:var(--accent)]/5"
                      : "border-paper-line bg-paper-card hover:border-border-soft"
                  }`}
                >
                  <p className="font-medium text-ink text-sm">{t.label}</p>
                  <p className="mt-1 text-xs text-ink-mid">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="block text-sm font-medium text-ink mb-3">
            Brand colour <span className="text-ink-mid font-normal">(used for your avatar tile across the project)</span>
          </p>
          <div className="flex items-center gap-3">
            {COLOUR_SWATCHES.map((c) => {
              const selected = formData.org.colour === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      org: { ...prev.org, colour: c },
                    }))
                  }
                  className={`h-10 w-10 rounded-full transition-all ${
                    selected ? "ring-2 ring-offset-2 ring-ink" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Choose colour ${c}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
