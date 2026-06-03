"use client";

import { useMemo } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { BRAND } from "@/lib/brand";
import { deriveKeptRate, deriveOrgColour, displayName, getInitials } from "../utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EvidenceRow = { tone: "danger" | "warning"; lead: string; detail: string };
type Evidence = { rows: EvidenceRow[]; verdict: string };

// External steel design-chain (FAB-ADMIN-1120). Surfaces on both the named
// design lead and Drawings Lead, the clickable accountable for that blocker.
const FAB_EVIDENCE: Evidence = {
  rows: [
    {
      tone: "danger",
      lead: "5 escalations, 4 unactioned",
      detail: "Drawings Lead escalated the lighting spec 5 times since 14 Mar; 4 produced no response",
    },
    {
      tone: "danger",
      lead: "3 commitments broken",
      detail: '"by Friday" (21 Mar), "next week" (4 Apr), "end of month" (28 Apr) — none met',
    },
    {
      tone: "danger",
      lead: "PM escalation unopened",
      detail: "formal note from Commissioning Lead on 8 May has NOT been opened (20 days)",
    },
    {
      tone: "warning",
      lead: "Blocking 3 downstream tasks",
      detail: "steel drawings, lighting brackets, external cladding all held",
    },
  ],
  verdict:
    "38% isn't slowness — it's 4 broken commitments and an unopened escalation. This is a deprioritisation pattern, not a capacity problem.",
};

// The Commissioning Lead's roster record (commissioning.lead@contractor.example).
const LEAD_EVIDENCE: Evidence = {
  rows: [
    {
      tone: "danger",
      lead: "5 of 13 commitments blocked upstream",
      detail: "waiting on Design Studio responses, avg 5.9 days vs 24h target",
    },
    {
      tone: "danger",
      lead: "Design Studio accounts for 57% of his kept-rate impact",
      detail: "not his own delays",
    },
    {
      tone: "warning",
      lead: "Carrying 2.9× peer workload",
      detail: "32 open items vs peer average of 11",
    },
  ],
  verdict:
    "Commissioning Lead's 68% is upstream-driven. Take Design Studio out of the equation and he's at 91%. He's overloaded, not underperforming.",
};

const EVIDENCE: Record<string, Evidence> = {
  "design lead": FAB_EVIDENCE,
  "drawings lead": FAB_EVIDENCE,
  "commissioning lead": LEAD_EVIDENCE,
  "site lead": {
    rows: [
      {
        tone: "danger",
        lead: "3 commitments broken",
        detail: '"Friday", "next week", "2 lads" — all on ELE-COLO-1030 brackets',
      },
      {
        tone: "danger",
        lead: "Crew diverted to Project Brown",
        detail: "day 53, brackets arrived but crew moved off MER",
      },
      {
        tone: "danger",
        lead: "Stopped responding",
        detail: "no reply to PM contact in 19 days",
      },
    ],
    verdict:
      "25% reflects choice, not capacity. MEP Sub is prioritising other work. Needs director-to-director escalation.",
  },
};

function evidenceFor(name: string): Evidence | null {
  return EVIDENCE[(name || "").trim().toLowerCase()] ?? null;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function range(seed: number, slot: number, min: number, span: number): number {
  return min + ((seed + slot * 7919) % span);
}

function rangeFloat(seed: number, slot: number, min: number, max: number): number {
  const span = max - min;
  const r = ((seed + slot * 6151) % 1000) / 1000;
  return Math.round((min + span * r) * 10) / 10;
}

function rotatedDeliverable(seed: number): string {
  const pool = [
    "drawing revisions",
    "sign-off responses",
    "design clarifications",
    "RFI replies",
  ];
  return pool[seed % pool.length];
}

function pickPeer(name: string, team: any[] | null): string {
  const others = (team ?? [])
    .map((p) => (p?.name ?? "").toString().trim())
    .filter((n) => n && n.toLowerCase() !== name.toLowerCase());
  if (others.length === 0) return "their counterpart";
  return others[hashStr(name) % others.length];
}

type SparklineKind = "down" | "up" | "flat";

function buildSparkline(rate: number, kind: SparklineKind): number[] {
  const base = rate;
  const points: number[] = [];
  for (let i = 0; i < 8; i++) {
    let p: number;
    if (kind === "down") {
      // start ~+8 above, end at base
      p = base + 8 - i * 1.2 + ((hashStr(`d-${i}`) % 5) - 2);
    } else if (kind === "up") {
      p = base - 6 + i * 0.9 + ((hashStr(`u-${i}`) % 5) - 2);
    } else {
      p = base + ((hashStr(`f-${i}`) % 5) - 2);
    }
    points.push(Math.max(20, Math.min(100, Math.round(p))));
  }
  return points;
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 120;
  const h = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  person: any | null;
  project: WizardData;
  blockerMap: BlockerMap | null;
  viewingAs: ViewingAs;
  onClose: () => void;
  onOpenBlocker: (id: string) => void;
};

export default function PersonDetailPanel({
  person,
  project,
  blockerMap,
  onClose,
  onOpenBlocker: _onOpenBlocker,
}: Props) {
  const data = useMemo(() => {
    if (!person) return null;
    const name = displayName(person);
    const org = (person.organisation ?? "").toString().trim();
    const role = (person.role ?? "").toString().trim();
    const trade = (person.trade ?? "").toString().trim();
    const keptRate = deriveKeptRate(name);
    const seed = hashStr(name);

    const trend: SparklineKind =
      keptRate < 70 ? "down" : keptRate > 85 ? "up" : "flat";
    const trendDelta =
      trend === "down" ? -range(seed, 4, 4, 9) : trend === "up" ? range(seed, 5, 2, 6) : 0;
    const spark = buildSparkline(keptRate, trend);

    // Active work counts
    const assetsOwned = (project.uploads.assets ?? []).filter(
      (a: any) =>
        (a?.owner_name ?? "").toString().trim().toLowerCase() ===
        name.toLowerCase(),
    ).length;
    const constraintsOwned = Object.values(blockerMap ?? {}).filter(
      (b) =>
        (b.current_owner ?? "").toString().trim().toLowerCase() ===
        name.toLowerCase(),
    ).length;
    const promisesMade = range(seed, 6, 8, 15);

    // Diagnostic numbers
    const card1 = {
      blockedCount: range(seed, 1, 5, 5), // 5–9
      openCount: range(seed, 2, 8, 8), // 8–15
      avgWaitDays: rangeFloat(seed, 3, 3.5, 6.2),
      pctImpact: range(seed, 4, 50, 26), // 50–75
    };
    const card2 = {
      openItems: range(seed, 7, 18, 15), // 18–32
      peerAvg: range(seed, 8, 8, 5), // 8–12
    };
    const multiplier = +(card2.openItems / card2.peerAvg).toFixed(1);
    const card3 = {
      lateCount: range(seed, 9, 3, 5), // 3–7
      deliverable: rotatedDeliverable(seed),
    };

    const peer = pickPeer(name, project.uploads.team);
    return {
      name,
      org,
      role,
      trade,
      keptRate,
      trend,
      trendDelta,
      spark,
      assetsOwned,
      constraintsOwned,
      promisesMade,
      card1,
      card2,
      card3,
      multiplier,
      peer,
    };
  }, [person, project, blockerMap]);

  if (!person || !data) return null;

  const heroColour =
    data.keptRate < 60
      ? "text-red-700"
      : data.keptRate < 80
        ? "text-amber-700"
        : "text-green-700";
  const trendColour = data.trendDelta < 0 ? "text-red-700" : data.trendDelta > 0 ? "text-green-700" : "text-ink-mid";
  const trendArrow = data.trendDelta < 0 ? "▼" : data.trendDelta > 0 ? "▲" : "—";

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-label="Person detail"
        className="flex h-full w-[450px] max-w-full flex-col border-l border-paper-line bg-paper-card shadow-[0_0_50px_-10px_rgba(26,15,43,0.35)]"
      >
        <header className="border-b border-paper-line px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-paper"
                style={{ backgroundColor: deriveOrgColour(data.org) }}
              >
                {getInitials(data.name)}
              </span>
              <div className="min-w-0">
                <h2
                  className="font-[family-name:var(--font-fraunces)] font-semibold text-ink truncate"
                  style={{ fontSize: 28, lineHeight: 1.1 }}
                >
                  {data.name}
                </h2>
                <p className="mt-0.5 text-sm text-ink-mid">
                  {data.role || "—"} · {data.org || "—"}
                </p>
                {data.trade && (
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-mid">
                    {data.trade}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-ink-mid transition-colors hover:bg-paper-warm hover:text-ink"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Kept-rate hero */}
          <section>
            <div className="flex items-end gap-4">
              <p
                className={`font-[family-name:var(--font-fraunces)] font-semibold ${heroColour}`}
                style={{ fontSize: 56, lineHeight: 1 }}
              >
                {data.keptRate}%
              </p>
              <div className="pb-2">
                <Sparkline
                  points={data.spark}
                  color={data.trendDelta < 0 ? "#dc2626" : data.trendDelta > 0 ? "#16a34a" : "#5a4a72"}
                />
                <p className={`mt-0.5 text-xs font-medium ${trendColour}`}>
                  {trendArrow} {data.trendDelta > 0 ? "+" : ""}
                  {data.trendDelta}% over 30 days
                </p>
              </div>
            </div>
            <p
              className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
              style={{ fontSize: 12 }}
            >
              Sample data — real scoring begins pilot week 2 when promises and
              handoffs are logged.
            </p>
          </section>

          {/* Diagnostic — THE CRITICAL SECTION */}
          <section>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep"
              style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
            >
              Dependency diagnostic
            </p>
            <h3
              className="mt-1 font-[family-name:var(--font-fraunces)] font-medium text-ink"
              style={{ fontSize: 18, lineHeight: 1.2 }}
            >
              Why this number is what it is
            </h3>

            <div className="mt-3 space-y-2.5">
              {data.keptRate > 90 ? (
                <DiagnosticCard
                  dot="green"
                  eyebrow="No blockers"
                  bold="Top performer this period"
                  detail={`${data.name} consistently meeting commitments despite carrying ${data.card2.openItems} active items. Peer average for comparison: ${data.card2.peerAvg} items.`}
                />
              ) : (
                <>
                  {data.keptRate < 70 && (
                    <DiagnosticCard
                      dot="red"
                      eyebrow="Waiting on"
                      bold="Design Studio team"
                      detail={`${data.card1.blockedCount} of ${data.name}'s ${data.card1.openCount} open commitments are blocked waiting on Design Studio responses. Average wait: ${data.card1.avgWaitDays} days (target: 24 hours). Design Studio's response time accounts for ${data.card1.pctImpact}% of ${data.name}'s kept-rate impact.`}
                      buttonLabel="Escalate to Design Studio ↗"
                      onClick={() =>
                        alert(
                          `Escalation to Design Studio — wired into the routing layer pilot week 2.`,
                        )
                      }
                    />
                  )}

                  <DiagnosticCard
                    dot="yellow"
                    eyebrow="Workload"
                    bold={`${data.name} carrying ${data.multiplier}× peer average`}
                    detail={`Currently has ${data.card2.openItems} open items vs peer average of ${data.card2.peerAvg}. Allocation review recommended.`}
                    buttonLabel="Review allocation with PM ↗"
                    onClick={() =>
                      alert("Allocation review — pilot week 2 deliverable.")
                    }
                  />

                  {data.keptRate < 55 && (
                    <DiagnosticCard
                      dot="orange"
                      eyebrow="Pattern"
                      bold="Recurring late deliverable type"
                      detail={`${data.name} late on ${data.card3.lateCount} ${data.card3.deliverable} this quarter. Pattern: dependency on Design Studio response time exceeds ${data.card3.lateCount}× target. Consider structural fix.`}
                      buttonLabel="View pattern detail ↗"
                      onClick={() =>
                        alert("Pattern detail — pilot week 6 AI deliverable.")
                      }
                    />
                  )}
                </>
              )}
            </div>

            <p
              className="mt-3 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
              style={{ fontSize: 13, lineHeight: 1.5 }}
            >
              Kept-rate alone misleads. The diagnostic above shows whether
              someone is genuinely slow, overloaded, or being held back by
              upstream dependencies. Always check the chain before drawing
              conclusions.
            </p>
          </section>

          {/* The evidence — dated receipts behind the number */}
          <EvidenceSection name={data.name} />

          {/* Active work */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Active work
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Assets owned" value={data.assetsOwned} />
              <Stat label="Constraints owned" value={data.constraintsOwned} />
              <Stat label="Promises (period)" value={data.promisesMade} />
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mid mb-2">
              Recent activity
            </p>
            <ul className="space-y-2">
              {[
                {
                  when: "2 days ago",
                  text: `Promised ${rotatedDeliverable(hashStr(data.name) + 1)} to ${data.peer}`,
                  dot: "bg-blue-500",
                },
                {
                  when: "4 days ago",
                  text: `Late on ${rotatedDeliverable(hashStr(data.name) + 2)}`,
                  dot: "bg-red-500",
                },
                {
                  when: "1 week ago",
                  text: `Accepted handoff from ${data.peer}`,
                  dot: "bg-amber-500",
                },
                {
                  when: "2 weeks ago",
                  text: `Kept commitment on ${rotatedDeliverable(hashStr(data.name) + 3)}`,
                  dot: "bg-green-500",
                },
              ].map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-xl border border-paper-line bg-paper-card px-3 py-2"
                >
                  <span className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${a.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink">{a.text}</p>
                    <p className="text-[10px] text-ink-mid">{a.when}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-paper-line px-5 py-3">
          <button
            type="button"
            onClick={() =>
              alert(`Message ${data.name} — messaging surface coming pilot week 2.`)
            }
            className="rounded-xl bg-ink px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-accent"
          >
            Message {data.name.split(" ")[0]}
          </button>
          <button
            type="button"
            onClick={() => alert("All-of-their-work view — pilot week 3.")}
            className="rounded-xl border border-paper-line bg-paper-card px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Open all their work
          </button>
          <button
            type="button"
            onClick={() => alert("Schedule check-in — calendar integration pilot week 4.")}
            className="rounded-xl border border-paper-line bg-paper-card px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Schedule check-in
          </button>
        </footer>
      </aside>
    </div>
  );
}

function EvidenceSection({ name }: { name: string }) {
  const evidence = evidenceFor(name);

  return (
    <section>
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.inkMuted,
          fontWeight: 600,
        }}
      >
        The Evidence · Why This Number
      </p>

      {evidence ? (
        <>
          <div className="mt-3 space-y-2.5">
            {evidence.rows.map((row, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 inline-block flex-shrink-0 rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor:
                      row.tone === "warning" ? BRAND.warningInk : BRAND.dangerInk,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink }}>
                    {row.lead}
                  </p>
                  <p style={{ fontSize: 12, color: BRAND.inkMuted, marginTop: 1, lineHeight: 1.4 }}>
                    {row.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.ink,
              borderLeft: `2px solid ${BRAND.dangerInk}`,
              paddingLeft: 10,
              marginTop: 14,
              lineHeight: 1.45,
            }}
          >
            {evidence.verdict}
          </p>
        </>
      ) : (
        <p
          className="font-[family-name:var(--font-fraunces)] italic"
          style={{ fontSize: 13, color: BRAND.inkMuted, marginTop: 10, lineHeight: 1.5 }}
        >
          Evidence builds as commitments are logged — pilot week 2 surfaces the full
          pattern per person.
        </p>
      )}
    </section>
  );
}

function DiagnosticCard({
  dot,
  eyebrow,
  bold,
  detail,
  buttonLabel,
  onClick,
}: {
  dot: "red" | "amber" | "yellow" | "orange" | "green";
  eyebrow: string;
  bold: string;
  detail: string;
  buttonLabel?: string;
  onClick?: () => void;
}) {
  const dotClass: Record<string, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    green: "bg-green-500",
  };
  const borderClass: Record<string, string> = {
    red: "border-red-200 bg-red-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    yellow: "border-yellow-200 bg-yellow-50/50",
    orange: "border-orange-200 bg-orange-50/50",
    green: "border-green-200 bg-green-50/50",
  };

  return (
    <div className={`rounded-2xl border p-3.5 ${borderClass[dot]}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass[dot]}`} />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep">
            {eyebrow.toUpperCase()}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{bold}</p>
          <p className="mt-1.5 text-xs text-ink leading-relaxed">{detail}</p>
          {buttonLabel && (
            <button
              type="button"
              onClick={onClick}
              className="mt-2 rounded-full border border-paper-line bg-paper-card px-3 py-1 text-[11px] font-medium text-ink-mid transition-colors hover:border-accent hover:text-accent"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-paper-line bg-paper-card p-3 text-center">
      <p
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1 }}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-mid">
        {label}
      </p>
    </div>
  );
}
