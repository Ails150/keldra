"use client";

import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
};

type Dot = "red" | "amber" | "green";

const DOT: Record<Dot, string> = {
  red: BRAND.dangerInk,
  amber: BRAND.warningInk,
  green: BRAND.successInk,
};

type Change = { tone: Dot; text: string };

// Pilot computes week-over-week deltas from snapshots — hardcoded for the demo.
const WEEK_CHANGES: Change[] = [
  {
    tone: "red",
    text: "Forecast BU slipped +4 days — now 20 Dec (was 16 Dec last Friday) — driven by ELE-COLO-1030 still open",
  },
  {
    tone: "red",
    text: "ELE-COLO-1030 cost raised £15k→£20k/day — now blocking SCCR cabling, second downstream task added",
  },
  {
    tone: "red",
    text: "Formal escalation to Mark Higgins (Cental) unopened 19 days — no movement",
  },
  {
    tone: "amber",
    text: "MEC-COLO-1040 entered critical path — water services Status A now gating MMR1 first-fix",
  },
  {
    tone: "red",
    text: "2 new blockers logged — total now 7 across 4 companies, £73k/day burn (was £68k)",
  },
];

type Row = {
  // A real activity-id links through to the task page; a tag renders as a chip
  // (phases / milestones that aren't a single P6 task).
  id?: string;
  tag?: string;
  name: string;
  dot: Dot;
};

type Horizon = {
  label: string;
  date: string;
  dot: Dot;
  verdict: string;
  rows: Row[];
  action: string;
};

// Pilot wires this to live critical-path recompute — hardcoded for the demo,
// drawn from the existing DUB-16 blockers.
const HORIZONS: Horizon[] = [
  {
    label: "This week",
    date: "to 02 Jun",
    dot: "red",
    verdict: "2 reds must clear or Site Install slips",
    rows: [
      { id: "ELE-COLO-1030", name: "Telecoms bracketery — Cental blocked", dot: "red" },
      { id: "MEC-COLO-1040", name: "Water services COLO 1-4 — Status A held", dot: "red" },
    ],
    action: "Director escalation on Cental + Sellafield — PM chases have stalled",
  },
  {
    label: "In 3 weeks",
    date: "by 18 Jun",
    dot: "red",
    verdict: "Steel chain frozen behind Microsoft sign-off",
    rows: [
      { tag: "Phase", name: "Site Install prep — sequencing at risk", dot: "amber" },
      { id: "FAB-ADMIN-1120", name: "External service support steel", dot: "red" },
    ],
    action: "Chase Microsoft power-loading sign-off — it releases Lawrence → Marco",
  },
  {
    label: "In 6 weeks",
    date: "by 09 Jul",
    dot: "amber",
    verdict: "Gated on water services Status A clearing in next 3 weeks",
    rows: [
      { tag: "Milestone", name: "MMR1 mechanical first-fix (29 Jun)", dot: "amber" },
    ],
    action: "First-fix can only start once MEC-COLO-1040 releases — watch the 3-week window",
  },
];

export default function ScheduleView(_props: Props) {
  const router = useRouter();

  return (
    <section className="mx-auto max-w-6xl px-8 space-y-5">
      <header>
        <p
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: BRAND.purpleDeep }}
        >
          Look-ahead · DUB-16
        </p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold"
          style={{ fontSize: 28, lineHeight: 1.15, color: BRAND.ink }}
        >
          Schedule
        </h1>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] italic"
          style={{ fontSize: 14, color: BRAND.inkMuted }}
        >
          Looking ahead — what lands when, and what&apos;s already at risk. Today&apos;s
          blockers shown against the next 6 weeks.
        </p>
      </header>

      <WeekChangesBand />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {HORIZONS.map((h) => (
          <HorizonColumn key={h.label} horizon={h} onOpenTask={(id) => router.push(`/dashboard/tasks/${id}`)} />
        ))}
      </div>

      <p style={{ fontSize: 11, color: BRAND.inkMuted, fontStyle: "italic" }}>
        Pilot recomputes these horizons live off the critical path as the programme moves.
      </p>
    </section>
  );
}

function WeekChangesBand() {
  return (
    <div
      style={{
        backgroundColor: "#f6f0fc",
        border: `0.5px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.purple,
          fontWeight: 600,
        }}
      >
        What changed this week · 21–28 May
      </p>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {WEEK_CHANGES.map((c, i) => (
          <div key={i} className="flex items-start" style={{ gap: 10 }}>
            <span
              className="inline-block flex-shrink-0 rounded-full"
              style={{ width: 8, height: 8, backgroundColor: DOT[c.tone], transform: "translateY(5px)" }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: BRAND.ink }}>{c.text}</span>
          </div>
        ))}
      </div>

      <p
        className="font-[family-name:var(--font-fraunces)] italic"
        style={{ fontSize: 13, lineHeight: 1.5, color: BRAND.inkMuted, marginTop: 14 }}
      >
        Net: programme moved 4 days the wrong way this week. Three of five changes trace to
        Microsoft sign-offs.
      </p>
    </div>
  );
}

function HorizonColumn({
  horizon,
  onOpenTask,
}: {
  horizon: Horizon;
  onOpenTask: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col"
      style={{
        backgroundColor: "#fff",
        border: `0.5px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      {/* Header */}
      <div>
        <p
          className="font-[family-name:var(--font-fraunces)] font-semibold"
          style={{ fontSize: 17, lineHeight: 1.15, color: BRAND.ink }}
        >
          {horizon.label}
        </p>
        <p
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: BRAND.inkMuted,
            marginTop: 2,
          }}
        >
          {horizon.date}
        </p>
      </div>

      {/* Verdict */}
      <div className="flex items-center" style={{ gap: 8, marginTop: 12 }}>
        <span
          className="inline-block flex-shrink-0 rounded-full"
          style={{ width: 9, height: 9, backgroundColor: DOT[horizon.dot] }}
        />
        <p style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{horizon.verdict}</p>
      </div>

      {/* Rows */}
      <ul className="flex-1" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {horizon.rows.map((r, i) => {
          const clickable = !!r.id;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => r.id && onOpenTask(r.id)}
                className={clickable ? "w-full text-left transition-colors active:opacity-80" : "w-full text-left"}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  backgroundColor: BRAND.cream,
                  border: `0.5px solid ${BRAND.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: 7, height: 7, backgroundColor: DOT[r.dot], transform: "translateY(3px)" }}
                />
                <span className="min-w-0">
                  {r.id ? (
                    <span className="font-mono" style={{ fontSize: 10, color: BRAND.purpleDeep }}>
                      {r.id}
                    </span>
                  ) : (
                    <span
                      className="rounded-full"
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                        color: BRAND.inkMuted,
                        backgroundColor: "#fff",
                        border: `0.5px solid ${BRAND.border}`,
                        padding: "1px 6px",
                      }}
                    >
                      {r.tag}
                    </span>
                  )}
                  <span className="block" style={{ fontSize: 12.5, color: BRAND.ink, marginTop: 2 }}>
                    {r.name}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Action footer */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${BRAND.border}` }}>
        <p
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: BRAND.purple,
            fontWeight: 600,
          }}
        >
          → What to do
        </p>
        <p style={{ fontSize: 12, color: BRAND.ink, marginTop: 4, lineHeight: 1.45 }}>
          {horizon.action}
        </p>
      </div>
    </div>
  );
}
