"use client";

import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useDemo } from "../demo-store";

/* Director action queue. Pilot computes this live from gate state +
   cost-of-delay; hardcoded for the demo and kept in step with Gates /
   Overview so nothing on the board contradicts. */

type Decision = { id: string; action: string; cost: number };
type Later = { id: string; note: string; cost: string };

const NOW: Decision[] = [
  { id: "ELE-COLO-1030", action: "Escalate MEP Sub — director-to-director call on telecoms bracketery", cost: 20 },
  { id: "ELE-MER-1010", action: "Assign a crew — your own unstaffed MER1 earth bar", cost: 18 },
  { id: "MEC-COLO-1040", action: "Push Hyperscale Client for Status A sign-off on water services", cost: 15 },
];

const LATER: Later[] = [
  { id: "FAB-ADMIN-1120", note: "Spec change pending on external steel — chase RKD", cost: "£9k/day" },
  { id: "ELE-COLO-1031", note: "SCCR cabling — downstream of 1030, will release when 1030 clears", cost: "£6k/day" },
  { id: "CTR-COLO-1103", note: "BMS controller test scheduled tomorrow — confirm QA witness", cost: "on track" },
];

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: BRAND.inkMuted,
  fontWeight: 600,
};

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={BRAND.dangerInk}
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function TodayView({
  onOpenGate,
}: {
  onOpenGate: (gateId: string) => void;
}) {
  const router = useRouter();
  const { burnPerDay, state } = useDemo();
  const burnK = Math.round(burnPerDay / 1000);
  const changes = state.changes.slice(0, 5);

  return (
    <section className="mx-auto max-w-4xl px-8">
      {/* Header */}
      <div>
        <p style={eyebrow}>Thursday 28 May</p>
        <h1
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}
        >
          <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>3 decisions</span> need you
          today
        </h1>
      </div>

      {/* What just changed — live feed from the demo loop */}
      {changes.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={eyebrow}>What just changed</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {changes.map((c) => (
              <div
                key={c.id}
                style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, color: BRAND.ink, lineHeight: 1.5 }}
              >
                <span style={{ width: 16, flexShrink: 0 }} aria-hidden>{c.icon}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gate connection banner — the spine. Click → Gate C. */}
      <button
        type="button"
        onClick={() => onOpenGate("C")}
        className="w-full text-left transition-colors"
        style={{
          marginTop: 32,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 18px",
          background: BRAND.dangerSoft,
          borderLeft: `3px solid ${BRAND.dangerInk}`,
          borderRadius: "0 12px 12px 0",
          cursor: "pointer",
        }}
      >
        <span className="min-w-0 flex-1">
          <span style={{ ...eyebrow, color: BRAND.dangerInk }}>
            Blocking Gate C · COLO Hall 1 cooling
          </span>
          <span
            className="block"
            style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.5, marginTop: 6 }}
          >
            All 3 decisions sit in Gate C — blocked 19 days, £{burnK}k/day exposed. Clear them and the
            gate opens.
          </span>
        </span>
        <ChevronRight />
      </button>

      {/* Now · act today */}
      <div style={{ marginTop: 32 }}>
        <p style={eyebrow}>Now · act today</p>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {NOW.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => router.push(`/dashboard/tasks/${encodeURIComponent(d.id)}`)}
              className="w-full text-left transition-colors"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                background: BRAND.paperWhite,
                border: `0.5px solid ${BRAND.border}`,
                borderRadius: 10,
                padding: "14px 16px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = BRAND.borderStrong)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = BRAND.border)}
            >
              <span className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="font-mono" style={{ fontSize: 11, color: BRAND.purpleDeep }}>
                  {d.id}
                </span>
                <span style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.45 }}>{d.action}</span>
              </span>
              <span
                className="font-[family-name:var(--font-fraunces)] flex-shrink-0"
                style={{ fontSize: 18, fontWeight: 500, lineHeight: 1, color: BRAND.dangerInk, whiteSpace: "nowrap" }}
              >
                £{d.cost}k/day
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Later this week · by Monday */}
      <div style={{ marginTop: 40 }}>
        <p style={eyebrow}>Later this week · by Monday</p>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {LATER.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                background: BRAND.paperWarm,
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <span className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="font-mono" style={{ fontSize: 11, color: BRAND.inkMuted }}>
                  {l.id}
                </span>
                <span style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.45 }}>
                  {l.note}
                </span>
              </span>
              <span
                className="flex-shrink-0"
                style={{ fontSize: 13, color: BRAND.inkMuted, whiteSpace: "nowrap" }}
              >
                {l.cost}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Anchor */}
      <p
        className="font-[family-name:var(--font-fraunces)] italic"
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: `0.5px solid ${BRAND.border}`,
          fontSize: 13,
          color: BRAND.inkMuted,
          lineHeight: 1.55,
        }}
      >
        Clear the three above and you take £53k/day off the board.
      </p>
    </section>
  );
}
