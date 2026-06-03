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

// Pilot computes these live from the baseline + activity trail. Hardcoded for
// the demo and kept in step with the figures used on Today / Schedule /
// Holding-back so nothing on the board contradicts.
const CHANGED = [
  "BU forecast slipped +4 days — now 20 Dec",
  "2 new blockers logged — burn £68k → £73k/day",
  "ELE-COLO-1030 now blocking a second task (SCCR cabling)",
];

const FORECAST = [
  { eyebrow: "At site install", date: "17 Aug 26", headline: "12 weeks behind", dot: BRAND.warningInk, colour: BRAND.ink },
  { eyebrow: "At yellow tag", date: "04 Nov 26", headline: "8 weeks behind", dot: BRAND.warningInk, colour: BRAND.ink },
  { eyebrow: "At BU", date: "02 Dec 26", headline: "£4.2m exposure", dot: BRAND.dangerInk, colour: BRAND.dangerInk },
];

// Ranked by cost/day, descending.
const DECISIONS = [
  { id: "ELE-COLO-1030", cost: 20, action: "Escalate MEP Sub — director-to-director" },
  { id: "ELE-MER-1010", cost: 18, action: "Assign a crew — your own unstaffed task" },
  { id: "MEC-COLO-1040", cost: 15, action: "Push Hyperscale Client for Status A sign-off" },
];

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: BRAND.inkMuted,
  fontWeight: 600,
};

function Hot({ children }: { children: React.ReactNode }) {
  return <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>{children}</span>;
}

export default function OverviewView(_props: Props) {
  const router = useRouter();

  return (
    <section className="mx-auto max-w-4xl px-8 space-y-9">
      {/* Verdict — the 10-second read */}
      <div>
        <p style={eyebrow}>State of play · Thursday 28 May</p>
        <h1
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 22, lineHeight: 1.35, color: BRAND.ink, marginTop: 10 }}
        >
          MER is <Hot>18 days behind</Hot>, <Hot>£4.2m exposed</Hot>, and{" "}
          <Hot>5 of 7 blockers</Hot> trace to Hyperscale Client. <Hot>3 decisions</Hot> need you
          today.
        </h1>
      </div>

      {/* What changed since Friday */}
      <div>
        <p style={eyebrow}>What changed since Friday</p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {CHANGED.map((c, i) => (
            <div key={i} className="flex items-start" style={{ gap: 10 }}>
              <span
                className="inline-block flex-shrink-0 rounded-full"
                style={{ width: 8, height: 8, backgroundColor: BRAND.dangerInk, transform: "translateY(5px)" }}
              />
              <span style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.45 }}>{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Milestone forecast */}
      <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "18px 22px" }}>
        <p style={eyebrow}>Milestone forecast</p>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {FORECAST.map((f) => (
            <div key={f.eyebrow}>
              <p style={eyebrow}>{f.eyebrow}</p>
              <p style={{ fontSize: 12, color: BRAND.ink, marginTop: 6 }}>{f.date}</p>
              <div className="mt-1.5 flex items-center" style={{ gap: 8 }}>
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: 10, height: 10, backgroundColor: f.dot }}
                />
                <span
                  className="font-[family-name:var(--font-fraunces)] font-semibold"
                  style={{ fontSize: 18, lineHeight: 1.1, color: f.colour }}
                >
                  {f.headline}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What needs you today */}
      <div>
        <p style={eyebrow}>What needs you today</p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {DECISIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => router.push(`/dashboard/tasks/${encodeURIComponent(d.id)}`)}
              className="w-full text-left transition-colors active:opacity-80"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                backgroundColor: "#fff",
                border: `0.5px solid ${BRAND.border}`,
                borderRadius: 10,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <span className="min-w-0">
                <span className="font-mono" style={{ fontSize: 11, color: BRAND.purpleDeep }}>
                  {d.id}
                </span>
                <span className="block" style={{ fontSize: 14, color: BRAND.ink, marginTop: 3 }}>
                  {d.action}
                </span>
              </span>
              <span
                className="font-[family-name:var(--font-fraunces)] font-semibold flex-shrink-0"
                style={{ fontSize: 18, lineHeight: 1, color: BRAND.dangerInk }}
              >
                £{d.cost}k/day
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom line */}
      <p style={{ fontSize: 13, color: BRAND.ink, lineHeight: 1.5 }}>
        Burn today: <span style={{ fontWeight: 600 }}>£73k/day</span> across 4 companies. Clear
        the three above and you take <span style={{ fontWeight: 600, color: BRAND.dangerInk }}>£53k/day</span>{" "}
        off the board.
      </p>
    </section>
  );
}
