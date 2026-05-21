"use client";

import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
};

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
};

const HORIZON_EYEBROW = "HORIZON 2-3 · PILOT MONTHS 6-12 PREVIEW";

export default function IntelligenceView({ project: _p, viewingAs: _v, blockerMap: _b }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-8 space-y-10">
      <PageHeader />
      <DataFlowSection />
      <DailyDigestSection />
      <ReconciliationSection />
      <BenchmarkSection />
      <NorthStarSection />
    </section>
  );
}

// ---------- shared section frame ----------

function SectionCard({
  eyebrow = HORIZON_EYEBROW,
  children,
}: {
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border border-accent/30 bg-paper-warm/60 p-5 md:p-6">
      <span
        className="absolute left-3 top-3 inline-block h-1.5 w-1.5 bg-accent"
        aria-hidden
      />
      <p
        className="ml-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-deep"
        style={MONO_STYLE}
      >
        {eyebrow}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------- page header ----------

function PageHeader() {
  return (
    <header className="space-y-4">
      <div>
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-deep"
          style={MONO_STYLE}
        >
          Horizon 2-3 · Universal Truth Layer · Pilot months 6-12
        </p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Intelligence
        </h1>
        <p
          className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 16, lineHeight: 1.5 }}
        >
          All data flowing in. AI extracts truth. Everyone trusts the same record.
        </p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-accent-deep/40 bg-paper-warm/60 px-5 py-4">
        <p className="text-sm text-ink leading-relaxed">
          This is what Keldra becomes after 6 months of pilot data. Every screen
          below is future-state — hardcoded for preview. Real intelligence
          arrives once <span className="font-semibold">30+ blockers</span> and{" "}
          <span className="font-semibold">60+ days of project history</span> are
          captured.
        </p>
      </div>
    </header>
  );
}

// ---------- section 1: data flow ----------

const SOURCES: { label: string; dot: string }[] = [
  { label: "Voice notes (Whisper transcription)", dot: "bg-accent" },
  { label: "WhatsApp forwards", dot: "bg-green-500" },
  { label: "Field photos (GPS + EXIF)", dot: "bg-blue-500" },
  { label: "Site walk recordings", dot: "bg-amber-500" },
  { label: "Email correspondence", dot: "bg-rose-500" },
  { label: "Procore RFIs (read-only API)", dot: "bg-orange-500" },
  { label: "Aconex documents", dot: "bg-teal-500" },
  { label: "Autodesk BIM model events", dot: "bg-indigo-500" },
  { label: "Primavera P6 baseline", dot: "bg-fuchsia-500" },
  { label: "IoT asset sensors", dot: "bg-cyan-500" },
  { label: "GPS sign-in events", dot: "bg-lime-500" },
  { label: "Weather API", dot: "bg-sky-500" },
];

const OUTPUTS: { label: string; sub: string }[] = [
  { label: "MD daily digest", sub: "Mercury Engineering" },
  { label: "PM live dashboard", sub: "DUB-12 project" },
  { label: "Site lead push alerts", sub: "Tom Walsh" },
  { label: "Client read-only portal", sub: "Hyperscaler X" },
  { label: "Insurance risk score", sub: "Mercury Indemnity" },
  { label: "Investor benchmark", sub: "Procurement" },
];

function DataFlowSection() {
  return (
    <SectionCard>
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        Data inflow → AI layer → Universal truth
      </h2>
      <p className="mt-1 text-sm text-ink-mid">
        The bloodstream of a project — what flows in, what gets extracted, what
        each role sees.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.1fr_1fr]">
        {/* Left column — sources */}
        <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-mid"
            style={MONO_STYLE}
          >
            Sources flowing in
          </p>
          <ul className="mt-3 space-y-1.5">
            {SOURCES.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className={`relative inline-flex h-2 w-2 ${s.dot} rounded-full`}>
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.dot} opacity-60`} />
                </span>
                <span className="text-xs text-ink">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Middle column — AI layer */}
        <div className="relative rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-paper-warm to-paper-card p-4 shadow-[0_8px_28px_-12px_rgba(138,61,214,0.35)]">
          <span
            className="absolute -left-3 top-1/2 hidden h-px w-3 bg-accent/40 md:block"
            aria-hidden
          />
          <span
            className="absolute -right-3 top-1/2 hidden h-px w-3 bg-accent/40 md:block"
            aria-hidden
          />
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-deep"
            style={MONO_STYLE}
          >
            AI extraction
          </p>
          <h3
            className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 18, lineHeight: 1.2 }}
          >
            Keldra intelligence layer
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Gemini 2.5 Flash", "Whisper", "GPT-4", "text-embedding-004"].map(
              (m) => (
                <span
                  key={m}
                  className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-deep"
                >
                  {m}
                </span>
              ),
            )}
          </div>

          <div className="mt-4 space-y-2">
            <CounterRow value="4,387" label="events processed" />
            <CounterRow value="312" label="voice notes transcribed" />
            <CounterRow value="89" label="photo evidence pieces" />
            <CounterRow value="47" label="cross-source conflicts resolved" />
          </div>

          <p
            className="mt-4 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 12 }}
          >
            Models swap as the field evolves — orchestration layer is the moat.
          </p>
        </div>

        {/* Right column — outputs */}
        <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-mid"
            style={MONO_STYLE}
          >
            Truth surfaced to roles
          </p>
          <ul className="mt-3 space-y-2">
            {OUTPUTS.map((o) => (
              <li
                key={o.label}
                className="rounded-xl border border-paper-line bg-paper-warm/50 px-3 py-2"
              >
                <p className="text-xs font-medium text-ink">{o.label}</p>
                <p className="text-[11px] text-ink-mid">{o.sub}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p
        className="mt-4 font-[family-name:var(--font-fraunces)] italic text-ink-mid text-center"
        style={{ fontSize: 12 }}
      >
        Each source streams in continuously. The audit chain — not any single
        source — is the canonical record.
      </p>
    </SectionCard>
  );
}

function CounterRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink tabular-nums"
        style={{ fontSize: 22, lineHeight: 1 }}
      >
        {value}
      </span>
      <span className="text-[11px] text-ink-mid">{label}</span>
    </div>
  );
}

// ---------- section 2: MD daily digest ----------

const PORTFOLIO_PROJECTS = [
  { name: "DUB-12 Building 4", exposure: "£98,000/day", desc: "Mercury × Ardmac × MS" },
  { name: "DUB-10 Building 2", exposure: "£142,000/day", desc: "Mercury × Sisk" },
  { name: "Cork DC Phase 3", exposure: "£103,000/day", desc: "Mercury × BAM × OCC" },
  { name: "FRA-04 Commissioning", exposure: "£88,000/day", desc: "Mercury × ENGIE" },
  { name: "AMS-03 Handover", exposure: "£56,000/day", desc: "Mercury × Heijmans" },
];

const PATTERNS = [
  {
    title: "Cable tray clashes with structural beam",
    detail:
      "14 instances across 4 projects, 9 traced to Central Design response time > 5 days.",
    rec: "Weekly coordination with structural lead.",
  },
  {
    title: "MMR earthing scope ambiguity",
    detail:
      "8 instances across DUB-12 and Cork DC, all Mercury-vs-Ardmac handoff.",
    rec: "Update Ardmac SOW template.",
  },
  {
    title: "UPS commissioning delay",
    detail: "6 instances, primary cause Primo Power lead time.",
    rec: "16-week PO requirement.",
  },
];

const INTERVENTIONS = [
  {
    severity: "high",
    text:
      "If Lawrence Burke's kept-rate doesn't improve by Friday, DUB-12 hits 2-week slip (£175,000 LD exposure).",
    action: "PM 1:1 by Wednesday.",
  },
  {
    severity: "high",
    text:
      "3 unowned blockers on Cork DC will hit 14-day escalation by Sunday.",
    action: "PM acceptance round Monday morning.",
  },
  {
    severity: "medium",
    text:
      "Central Design avg response time trending up to 6.4 days on DUB-12 — projected impact: 3 deliverables slipping by 22 May.",
    action: "Escalate to Central PM.",
  },
  {
    severity: "medium",
    text:
      "AMS-03 handover witness slots not yet booked with Heijmans for next week.",
    action: "Confirm calendar today.",
  },
  {
    severity: "low",
    text:
      "Primo Power kept-rate down 6% over 14 days across portfolio — supplier review trigger.",
    action: "Procurement sync Friday.",
  },
];

function DailyDigestSection() {
  return (
    <SectionCard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 22, lineHeight: 1.2 }}
          >
            Mercury MD daily digest
          </h2>
          <p className="mt-1 text-sm text-ink-mid">
            06:30 AM · delivered to{" "}
            <span className="font-medium text-ink">md@mercuryeng.com</span>
          </p>
        </div>
        <p
          className="font-mono text-[11px] uppercase tracking-wider text-ink-mid"
          style={MONO_STYLE}
        >
          Friday 22 May 2026
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <DigestCard title="Portfolio exposure today" headline="£487,000/day" sub="Across 5 active projects">
          <ul className="mt-3 divide-y divide-paper-line">
            {PORTFOLIO_PROJECTS.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {p.name}
                  </p>
                  <p className="text-[11px] text-ink-mid truncate">{p.desc}</p>
                </div>
                <span className="font-mono text-xs font-semibold text-red-700 tabular-nums">
                  {p.exposure}
                </span>
              </li>
            ))}
          </ul>
        </DigestCard>

        <DigestCard
          title="Cross-project patterns detected this week"
          headline="3 patterns"
        >
          <ul className="mt-3 space-y-3">
            {PATTERNS.map((p) => (
              <li
                key={p.title}
                className="rounded-xl border border-paper-line bg-paper-warm/40 p-3"
              >
                <p className="text-sm font-medium text-ink">{p.title}</p>
                <p className="mt-1 text-xs text-ink leading-relaxed">
                  {p.detail}
                </p>
                <p className="mt-1.5 text-[11px] text-accent-deep">
                  <span className="font-semibold uppercase tracking-wide">
                    Recommendation:
                  </span>{" "}
                  {p.rec}
                </p>
                <button
                  type="button"
                  onClick={() => alert("Live in pilot month 6.")}
                  className="mt-2 rounded-full border border-paper-line bg-paper-card px-2.5 py-0.5 text-[10px] font-medium text-ink-mid hover:border-accent hover:text-accent"
                >
                  Open →
                </button>
              </li>
            ))}
          </ul>
        </DigestCard>

        <DigestCard
          title="Predictive interventions for this week"
          headline="5 actions"
        >
          <ul className="mt-3 space-y-2.5">
            {INTERVENTIONS.map((i, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-paper-line bg-paper-card p-3"
              >
                <span
                  className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                    i.severity === "high"
                      ? "bg-red-500"
                      : i.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink leading-relaxed">{i.text}</p>
                  <p className="mt-1 text-[11px] text-accent-deep">
                    <span className="font-semibold uppercase tracking-wide">
                      Suggested action:
                    </span>{" "}
                    {i.action}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Live in pilot month 6.")}
                  className="rounded-full border border-paper-line bg-paper-card px-2.5 py-0.5 text-[10px] font-medium text-ink-mid hover:border-accent hover:text-accent"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </DigestCard>
      </div>
    </SectionCard>
  );
}

function DigestCard({
  title,
  headline,
  sub,
  children,
}: {
  title: string;
  headline: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
        {title}
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <p
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 28, lineHeight: 1 }}
        >
          {headline}
        </p>
        {sub && <p className="text-xs text-ink-mid">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------- section 3: conflict reconciliation ----------

function ReconciliationSection() {
  const sources = [
    {
      label: "Procore RFI #4521 closed",
      text: '"AHU commissioning complete 18 May"',
      who: "raised by Mercury",
      tone: "bg-orange-100 text-orange-800",
    },
    {
      label: "Aconex document signed",
      text: '"Witness sign-off 20 May"',
      who: "Ardmac",
      tone: "bg-teal-100 text-teal-800",
    },
    {
      label: "Keldra audit chain",
      text: '"Stage transition red→green 19 May 14:22"',
      who: "Tom Walsh",
      tone: "bg-accent/10 text-accent-deep",
    },
  ];

  return (
    <SectionCard>
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        Cross-source truth reconciliation
      </h2>
      <p className="mt-1 text-sm text-ink-mid">
        3 sources disagreed about MGR1 HRU-01 commissioning date — Keldra
        surfaced truth.
      </p>

      <ol className="mt-4 space-y-2">
        {sources.map((s, i) => (
          <li
            key={s.label}
            className="flex items-start gap-3 rounded-xl border border-paper-line bg-paper-card p-3"
          >
            <span className="font-mono text-[10px] text-ink-mid w-6 pt-0.5">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.tone}`}
                >
                  {s.label}
                </span>
                <span className="text-[11px] text-ink-mid">{s.who}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-2xl border border-accent/40 bg-paper-warm/60 p-4">
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-deep"
          style={MONO_STYLE}
        >
          Conflict resolved by Keldra
        </p>
        <p className="mt-2 text-sm text-ink leading-relaxed">
          Sign-off was 20 May per Aconex, but commissioning completed{" "}
          <span className="font-semibold">19 May per audit chain</span>. Procore
          RFI date was incorrectly closed early. All three systems now show{" "}
          <span className="font-semibold">19 May 14:22</span> as canonical.{" "}
          <span className="font-semibold">
            The audit chain wins because it has photo evidence + GPS confirmation.
          </span>
        </p>
      </div>

      <p
        className="mt-3 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
        style={{ fontSize: 12 }}
      >
        Keldra reconciles conflicts between Procore, Aconex, Autodesk, and
        Primavera automatically. The audit chain is the canonical source of
        truth.
      </p>
    </SectionCard>
  );
}

// ---------- section 4: industry benchmark ----------

function BenchmarkSection() {
  const stats = [
    {
      label: "Mercury portfolio kept-rate",
      value: "84%",
      industry: "Industry median across 47 contractors on Keldra: 71%",
      tone: "text-green-700",
    },
    {
      label: "Mercury avg blocker resolution",
      value: "4.2 days",
      industry: "Industry: 7.8 days",
      tone: "text-green-700",
    },
    {
      label: "Mercury audit completeness at handover",
      value: "97%",
      industry: "Industry: 64%",
      tone: "text-green-700",
    },
  ];

  return (
    <SectionCard eyebrow="HORIZON 4 · 2028+ · NETWORK INTELLIGENCE">
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        How Mercury benchmarks against industry
      </h2>
      <p className="mt-1 text-sm text-ink-mid">
        The first cross-firm performance dataset in construction — anonymised,
        opt-in, Enterprise-tier.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-paper-line bg-paper-card p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
              {s.label}
            </p>
            <p
              className={`mt-2 font-[family-name:var(--font-fraunces)] font-semibold ${s.tone}`}
              style={{ fontSize: 36, lineHeight: 1 }}
            >
              {s.value}
            </p>
            <p className="mt-2 text-[11px] text-ink-mid leading-snug">
              {s.industry}
            </p>
          </div>
        ))}
      </div>

      <p
        className="mt-4 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
        style={{ fontSize: 12 }}
      >
        Anonymised benchmarks across all Keldra customers. Available to
        Enterprise tier from Q1 2028. Becomes the construction industry&apos;s
        first cross-firm performance dataset.
      </p>
    </SectionCard>
  );
}

// ---------- section 5: north star ----------

function NorthStarSection() {
  return (
    <div className="relative mx-auto max-w-3xl rounded-3xl border-2 border-accent/40 bg-paper-warm/70 p-8 md:p-10 text-center">
      <span
        className="absolute left-4 top-4 inline-block h-1.5 w-1.5 bg-accent"
        aria-hidden
      />
      <p
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-deep"
        style={MONO_STYLE}
      >
        The North Star
      </p>
      <blockquote
        className="mt-4 font-[family-name:var(--font-fraunces)] italic text-ink"
        style={{ fontSize: 28, lineHeight: 1.25 }}
      >
        “All data, everything flowing into this. AI picks it up and provides
        universal truth.”
      </blockquote>
      <p
        className="mt-4 font-[family-name:var(--font-fraunces)] text-ink-mid"
        style={{ fontSize: 14 }}
      >
        — Aileen Doherty, Founder · Keldra
      </p>
      <p
        className="mt-6 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
        style={{ fontSize: 13, lineHeight: 1.55 }}
      >
        Today: pilot at Mercury Engineering on DUB-12 Building 4. By 2028: the
        canonical truth layer for construction.
      </p>
    </div>
  );
}
