"use client";

import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";

/* Commissioning gate ladder. Pilot computes gate state, tag counts and
   cost-of-delay live from the commissioning register; hardcoded here for the
   demo and kept in step with Today / Overview so nothing on the board
   contradicts. */

type GateStatus = "cleared" | "blocked" | "waiting";

type Decision = { id: string; action: string; cost: number };
type Later = { id: string; note: string; cost: string };

type Gate = {
  id: string;
  name: string;
  status: GateStatus;
  tagsDone: number;
  tagsTotal: number;
  note: string;
  clearedDate?: string;
  daysOpen?: number;
  perDay?: string;
  decisions?: Decision[];
  later?: Later[];
  waitingOn?: string;
  targetDate?: string;
};

const GATES: Gate[] = [
  {
    id: "A",
    name: "Containment & first fix",
    status: "cleared",
    tagsDone: 16,
    tagsTotal: 16,
    clearedDate: "14 Apr 26",
    note: "All LV containment and first-fix signed off across COLO 1–4.",
  },
  {
    id: "B",
    name: "Power distribution live",
    status: "cleared",
    tagsDone: 18,
    tagsTotal: 18,
    clearedDate: "06 May 26",
    note: "LV terminations and power-on checks complete. Boards energised.",
  },
  {
    id: "C",
    name: "COLO Hall 1 cooling",
    status: "blocked",
    tagsDone: 7,
    tagsTotal: 20,
    daysOpen: 19,
    perDay: "£73k/day",
    note: "Cooling commissioning can't proceed until the items below clear.",
    decisions: [
      { id: "ELE-COLO-1030", action: "Escalate MEP Sub — director-to-director call on telecoms bracketery", cost: 20 },
      { id: "ELE-MER-1010", action: "Assign a crew — your own unstaffed MER1 earth bar", cost: 18 },
      { id: "MEC-COLO-1040", action: "Push Hyperscale Client for Status A sign-off on water services", cost: 15 },
    ],
    later: [
      { id: "FAB-ADMIN-1120", note: "Spec change pending on external steel — chase RKD", cost: "£9k/day" },
      { id: "ELE-COLO-1031", note: "SCCR cabling — downstream of 1030, releases when 1030 clears", cost: "£6k/day" },
      { id: "CTR-COLO-1103", note: "BMS controller test scheduled tomorrow — confirm QA witness", cost: "on track" },
    ],
  },
  {
    id: "D",
    name: "Yellow tag · energisation",
    status: "waiting",
    tagsDone: 0,
    tagsTotal: 22,
    waitingOn: "Gate C",
    targetDate: "04 Nov 26",
    note: "Energisation sequence can't begin until cooling is commissioned.",
  },
  {
    id: "E",
    name: "Green tag · Beneficial Use",
    status: "waiting",
    tagsDone: 0,
    tagsTotal: 31,
    waitingOn: "Gate C",
    targetDate: "02 Dec 26",
    note: "Final integrated systems test and handover to Hyperscale Client.",
  },
];

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: BRAND.inkMuted,
  fontWeight: 600,
};

function palette(s: GateStatus): { ink: string; soft: string; label: string } {
  if (s === "cleared") return { ink: BRAND.successInk, soft: BRAND.successBg, label: "Cleared" };
  if (s === "blocked") return { ink: BRAND.dangerInk, soft: BRAND.dangerSoft, label: "Blocked" };
  return { ink: BRAND.inkMuted, soft: BRAND.paperWarm, label: "Waiting" };
}

export default function GatesView({
  selectedGate,
  onSelectGate,
}: {
  selectedGate: string;
  onSelectGate: (id: string) => void;
}) {
  const router = useRouter();
  const sel = GATES.find((g) => g.id === selectedGate) ?? GATES[2];

  return (
    <section className="mx-auto max-w-4xl px-8 space-y-9">
      {/* Header — the whole story in one line */}
      <div>
        <p style={eyebrow}>Commissioning gates · MER</p>
        <h1
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 22, lineHeight: 1.35, color: BRAND.ink, marginTop: 10 }}
        >
          Two gates cleared.{" "}
          <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>Gate C is blocking</span>, and
          D &amp; E can&apos;t start behind it.
        </h1>
      </div>

      {/* The ladder — five gates in sequence, click to inspect */}
      <div className="flex flex-wrap gap-2">
        {GATES.map((g) => {
          const p = palette(g.status);
          const isSel = g.id === sel.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGate(g.id)}
              className="text-left transition-colors"
              style={{
                flex: "1 1 0",
                minWidth: 124,
                background: isSel ? p.soft : BRAND.paperWhite,
                border: `${isSel ? 1.5 : 0.5}px solid ${isSel ? p.ink : BRAND.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                cursor: "pointer",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-[family-name:var(--font-fraunces)] font-semibold"
                  style={{ fontSize: 18, lineHeight: 1, color: BRAND.ink }}
                >
                  Gate {g.id}
                </span>
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: 9, height: 9, backgroundColor: p.ink }}
                />
              </div>
              <p style={{ fontSize: 12.5, color: BRAND.ink, marginTop: 6, lineHeight: 1.3 }}>
                {g.name}
              </p>
              <p style={{ ...eyebrow, color: p.ink, marginTop: 8 }}>{p.label}</p>
            </button>
          );
        })}
      </div>

      {/* Selected gate detail */}
      <GateDetail gate={sel} router={router} />
    </section>
  );
}

function GateDetail({
  gate,
  router,
}: {
  gate: Gate;
  router: ReturnType<typeof useRouter>;
}) {
  const p = palette(gate.status);
  const pct = gate.tagsTotal > 0 ? Math.round((gate.tagsDone / gate.tagsTotal) * 100) : 0;

  return (
    <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "20px 22px" }}>
      <p style={{ ...eyebrow, color: p.ink }}>
        Gate {gate.id} · {gate.name}
      </p>

      {gate.status === "blocked" && (
        <h2
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}
        >
          Blocked {gate.daysOpen} days ·{" "}
          <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>{gate.perDay} exposed</span>
        </h2>
      )}
      {gate.status === "cleared" && (
        <h2
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}
        >
          Cleared {gate.clearedDate}
        </h2>
      )}
      {gate.status === "waiting" && (
        <h2
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.inkMuted, marginTop: 8 }}
        >
          Waiting on {gate.waitingOn} · target {gate.targetDate}
        </h2>
      )}

      {/* Tag progress */}
      <div style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between">
          <span style={eyebrow}>Commissioning tags</span>
          <span className="font-mono" style={{ fontSize: 11, color: BRAND.inkMuted }}>
            {gate.tagsDone} / {gate.tagsTotal} signed off
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            height: 6,
            borderRadius: 9999,
            background: BRAND.paperWarm,
            overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: p.ink }} />
        </div>
      </div>

      <p style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.55, marginTop: 14 }}>
        {gate.note}
      </p>

      {/* Blocking decisions */}
      {gate.decisions && gate.decisions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p style={eyebrow}>What&apos;s blocking it · act today</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {gate.decisions.map((d) => (
              <DecisionRow
                key={d.id}
                d={d}
                onOpen={() => router.push(`/dashboard/tasks/${encodeURIComponent(d.id)}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Clearing this week */}
      {gate.later && gate.later.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p style={eyebrow}>Clearing this week</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {gate.later.map((l) => (
              <LaterRow key={l.id} l={l} />
            ))}
          </div>
        </div>
      )}

      {/* Anchor */}
      {gate.status === "blocked" && (
        <p
          className="font-[family-name:var(--font-fraunces)] italic"
          style={{
            fontSize: 13,
            color: BRAND.inkMuted,
            lineHeight: 1.55,
            marginTop: 24,
            paddingTop: 16,
            borderTop: `0.5px solid ${BRAND.border}`,
          }}
        >
          Clear the three above and Gate {gate.id} opens — D &amp; E unlock behind it. That&apos;s
          £53k/day off the board.
        </p>
      )}
    </div>
  );
}

function DecisionRow({ d, onOpen }: { d: Decision; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
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
        className="font-[family-name:var(--font-fraunces)] font-semibold flex-shrink-0"
        style={{ fontSize: 18, lineHeight: 1, color: BRAND.dangerInk, whiteSpace: "nowrap" }}
      >
        £{d.cost}k/day
      </span>
    </button>
  );
}

function LaterRow({ l }: { l: Later }) {
  return (
    <div
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
        <span style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.45 }}>{l.note}</span>
      </span>
      <span
        className="flex-shrink-0"
        style={{ fontSize: 13, color: BRAND.inkMuted, whiteSpace: "nowrap" }}
      >
        {l.cost}
      </span>
    </div>
  );
}
