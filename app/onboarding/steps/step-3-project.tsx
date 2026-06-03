"use client";

import type { StepProps } from "../types";

const SECTORS = [
  "Data centre",
  "Pharma",
  "Semiconductor",
  "Healthcare",
  "Other",
];

const BUILD_TYPES = [
  {
    id: "stick-built",
    label: "Stick-built",
    desc: "Everything assembled on site, traditional sequencing.",
  },
  {
    id: "modular",
    label: "Modular",
    desc: "Prefabricated skids/plant rooms delivered and connected.",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    desc: "Mix of modular plant + stick-built distribution.",
  },
];

export default function Step3Project({ formData, setFormData }: StepProps) {
  function updateProject<K extends keyof typeof formData.project>(
    key: K,
    value: (typeof formData.project)[K],
  ) {
    setFormData((prev) => ({
      ...prev,
      project: { ...prev.project, [key]: value },
    }));
  }

  return (
    <section className="mx-auto max-w-5xl px-8">
      <header className="mb-8">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 36, lineHeight: 1.1 }}
        >
          About the project
        </h1>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 17 }}
        >
          The high-level shape of what you're building.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-ink mb-2">
            Project name
          </label>
          <input
            type="text"
            value={formData.project.name}
            onChange={(e) => updateProject("name", e.target.value)}
            placeholder="e.g. MER CX"
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Client
          </label>
          <input
            type="text"
            value={formData.project.client}
            onChange={(e) => updateProject("client", e.target.value)}
            placeholder="e.g. Hyperscaler X"
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Sector
          </label>
          <select
            value={formData.project.sector}
            onChange={(e) => updateProject("sector", e.target.value)}
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          >
            <option value="">Choose a sector…</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Start date
          </label>
          <input
            type="date"
            value={formData.project.startDate}
            onChange={(e) => updateProject("startDate", e.target.value)}
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Handover date
          </label>
          <input
            type="date"
            value={formData.project.handoverDate}
            onChange={(e) => updateProject("handoverDate", e.target.value)}
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>

        <div className="md:col-span-2">
          <p className="block text-sm font-medium text-ink mb-3">Build type</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {BUILD_TYPES.map((b) => {
              const selected = formData.project.buildType === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => updateProject("buildType", b.id)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    selected
                      ? "border-accent bg-[color:var(--accent)]/5"
                      : "border-paper-line bg-paper-card hover:border-border-soft"
                  }`}
                >
                  <p className="font-medium text-ink">{b.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                    {b.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-ink mb-2">
            Location
          </label>
          <input
            type="text"
            value={formData.project.location}
            onChange={(e) => updateProject("location", e.target.value)}
            placeholder="e.g. Dublin, Ireland"
            className="w-full rounded-xl border border-border-soft bg-paper-card px-4 text-ink outline-none focus:border-accent transition-colors"
            style={{ height: 52, fontSize: 15 }}
          />
        </div>
      </div>
    </section>
  );
}
