"use client";

import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { useDemo, type LiveBlocker, type GateView } from "../demo-store";
import type { BlockerMap } from "../lib/blocker-state";
import type { DbGate } from "@/lib/org/dashboard-data";
import { loadBaseline, companyName } from "../lib/baseline-seed";

/* Commissioning gate ladder. Gate C is derived live from the demo store: its
   tag count, status and £/day burn come from the active blocker set, so
   escalating/resolving blockers moves the gate and cascades to D & E. */

type GateStatus = "cleared" | "blocked" | "waiting" | "ready";

type Gate = {
  id: string;
  name: string;
  status: GateStatus;
  tagsDone: number;
  tagsTotal: number;
  note: string;
  clearedDate?: string;
  daysOpen?: number;
  targetDate?: string;
  waitingOn?: string;
};

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
  if (s === "ready") return { ink: BRAND.successInk, soft: BRAND.successBg, label: "Ready" };
  return { ink: BRAND.inkMuted, soft: BRAND.paperWarm, label: "Waiting" };
}

function buildGates(gateC: GateView, gateDE: "waiting" | "ready"): Gate[] {
  const deStatus: GateStatus = gateDE === "ready" ? "ready" : "waiting";
  return [
    { id: "A", name: "Containment & first fix", status: "cleared", tagsDone: 16, tagsTotal: 16, clearedDate: "14 Apr 26", note: "All LV containment and first-fix signed off across COLO 1–4." },
    { id: "B", name: "Power distribution live", status: "cleared", tagsDone: 18, tagsTotal: 18, clearedDate: "06 May 26", note: "LV terminations and power-on checks complete. Boards energised." },
    {
      id: "C", name: "COLO Hall 1 cooling", status: gateC.status,
      tagsDone: gateC.tagsDone, tagsTotal: gateC.tagsTotal, daysOpen: 19,
      note: gateC.status === "cleared"
        ? "All commissioning tags signed off. Gate C is clear — D & E can start."
        : "Cooling commissioning can't proceed until the items below clear.",
    },
    { id: "D", name: "Yellow tag · energisation", status: deStatus, tagsDone: 0, tagsTotal: 22, waitingOn: "Gate C", targetDate: "04 Nov 26", note: gateDE === "ready" ? "Gate C cleared — energisation sequence can begin." : "Energisation sequence can't begin until cooling is commissioned." },
    { id: "E", name: "Green tag · Beneficial Use", status: deStatus, tagsDone: 0, tagsTotal: 31, waitingOn: "Gate C", targetDate: "02 Dec 26", note: gateDE === "ready" ? "Gate C cleared — final integrated systems test can be scheduled." : "Final integrated systems test and handover to Hyperscale Client." },
  ];
}

export default function GatesView(props: {
  selectedGate: string;
  onSelectGate: (id: string) => void;
  fromDb?: boolean;
  dbGates?: DbGate[];
  blockerMap?: BlockerMap | null;
}) {
  // Real org → DB gate ladder; anon demo → the existing live demo gates.
  if (props.fromDb && props.dbGates) {
    return (
      <DbGatesView
        gates={props.dbGates}
        blockerMap={props.blockerMap ?? null}
        selectedGate={props.selectedGate}
        onSelectGate={props.onSelectGate}
      />
    );
  }
  return <DemoGatesView selectedGate={props.selectedGate} onSelectGate={props.onSelectGate} />;
}

function DemoGatesView({
  selectedGate,
  onSelectGate,
}: {
  selectedGate: string;
  onSelectGate: (id: string) => void;
}) {
  const router = useRouter();
  const { gateC, gateDE, openBlockers, escalate, resolve } = useDemo();
  const gates = buildGates(gateC, gateDE);
  const sel = gates.find((g) => g.id === selectedGate) ?? gates[2];

  return (
    <section className="mx-auto max-w-4xl px-8 space-y-9">
      <div>
        <p style={eyebrow}>Commissioning gates · MER</p>
        <h1 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 22, lineHeight: 1.35, color: BRAND.ink, marginTop: 10 }}>
          {gateC.status === "cleared" ? (
            <>Gate C cleared. <span style={{ color: BRAND.successInk, fontWeight: 600 }}>D &amp; E are unlocked.</span></>
          ) : (
            <>Two gates cleared.{" "}<span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>Gate C is blocking</span>, and D &amp; E can&apos;t start behind it.</>
          )}
        </h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {gates.map((g) => {
          const p = palette(g.status);
          const isSel = g.id === sel.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGate(g.id)}
              className="text-left transition-colors"
              style={{ flex: "1 1 0", minWidth: 124, background: isSel ? p.soft : BRAND.paperWhite, border: `${isSel ? 1.5 : 0.5}px solid ${isSel ? p.ink : BRAND.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-fraunces)] font-semibold" style={{ fontSize: 18, lineHeight: 1, color: BRAND.ink }}>Gate {g.id}</span>
                <span className="inline-block flex-shrink-0 rounded-full" style={{ width: 9, height: 9, backgroundColor: p.ink }} />
              </div>
              <p style={{ fontSize: 12.5, color: BRAND.ink, marginTop: 6, lineHeight: 1.3 }}>{g.name}</p>
              <p style={{ ...eyebrow, color: p.ink, marginTop: 8 }}>{p.label}</p>
            </button>
          );
        })}
      </div>

      <GateDetail gate={sel} gateC={gateC} blockers={openBlockers} router={router} onEscalate={escalate} onResolve={resolve} />
    </section>
  );
}

function GateDetail({
  gate, gateC, blockers, router, onEscalate, onResolve,
}: {
  gate: Gate;
  gateC: GateView;
  blockers: LiveBlocker[];
  router: ReturnType<typeof useRouter>;
  onEscalate: (id: string, role: string) => void;
  onResolve: (id: string) => void;
}) {
  const p = palette(gate.status);
  const pct = gate.tagsTotal > 0 ? Math.round((gate.tagsDone / gate.tagsTotal) * 100) : 0;
  const isC = gate.id === "C";
  const burnK = Math.round(gateC.burnPerDay / 1000);

  return (
    <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "20px 22px" }}>
      <p style={{ ...eyebrow, color: p.ink }}>Gate {gate.id} · {gate.name}</p>

      {isC && gate.status === "blocked" && (
        <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}>
          Blocked {gate.daysOpen} days · <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>£{burnK}k/day exposed</span>
        </h2>
      )}
      {isC && gate.status === "cleared" && (
        <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.successInk, marginTop: 8 }}>
          Cleared · all {gate.tagsTotal} tags signed off
        </h2>
      )}
      {gate.status === "cleared" && !isC && (
        <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}>Cleared {gate.clearedDate}</h2>
      )}
      {gate.status === "waiting" && (
        <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.inkMuted, marginTop: 8 }}>Waiting on {gate.waitingOn} · target {gate.targetDate}</h2>
      )}
      {gate.status === "ready" && (
        <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.successInk, marginTop: 8 }}>Ready to start · target {gate.targetDate}</h2>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between">
          <span style={eyebrow}>Commissioning tags</span>
          <span className="font-mono" style={{ fontSize: 11, color: BRAND.inkMuted }}>{gate.tagsDone} / {gate.tagsTotal} signed off</span>
        </div>
        <div style={{ marginTop: 8, height: 6, borderRadius: 9999, background: BRAND.paperWarm, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: p.ink, transition: "width 240ms ease" }} />
        </div>
      </div>

      <p style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.55, marginTop: 14 }}>{gate.note}</p>

      {isC && blockers.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p style={eyebrow}>What&apos;s blocking it · {blockers.length} open · act today</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {blockers.map((b) => (
              <BlockerRow key={b.id} b={b}
                onOpen={() => router.push(`/dashboard/tasks/${encodeURIComponent(b.remote ? b.asset_id : b.id)}`)}
                onEscalate={() => onEscalate(b.id, "Operations Director")}
                onResolve={() => onResolve(b.id)} />
            ))}
          </div>
        </div>
      )}

      {isC && gate.status === "cleared" && (
        <p className="font-[family-name:var(--font-fraunces)] italic" style={{ fontSize: 13, color: BRAND.successInk, lineHeight: 1.55, marginTop: 24, paddingTop: 16, borderTop: `0.5px solid ${BRAND.border}` }}>
          Gate C is clear. Gates D &amp; E have unlocked — energisation and Beneficial Use can be scheduled.
        </p>
      )}
      {isC && gate.status === "blocked" && (
        <p className="font-[family-name:var(--font-fraunces)] italic" style={{ fontSize: 13, color: BRAND.inkMuted, lineHeight: 1.55, marginTop: 24, paddingTop: 16, borderTop: `0.5px solid ${BRAND.border}` }}>
          Resolve the items above and Gate {gate.id} opens — D &amp; E unlock behind it.
        </p>
      )}
    </div>
  );
}

function BlockerRow({
  b, onOpen, onEscalate, onResolve,
}: {
  b: LiveBlocker;
  onOpen: () => void;
  onEscalate: () => void;
  onResolve: () => void;
}) {
  const escalated = b.status === "escalated";
  return (
    <div style={{ background: BRAND.paperWhite, border: `0.5px solid ${escalated ? BRAND.warningInk : BRAND.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div className="flex items-start justify-between" style={{ gap: 16 }}>
        <button type="button" onClick={onOpen} className="min-w-0 text-left" style={{ display: "flex", flexDirection: "column", gap: 4, cursor: "pointer" }}>
          <span className="font-mono" style={{ fontSize: 11, color: BRAND.purpleDeep }}>{b.id}</span>
          <span style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.45 }}>{b.title}</span>
          <span style={{ fontSize: 11.5, color: BRAND.inkMuted }}>
            {b.owner_role} · {b.owner_org} · root: {b.root}
            {escalated && <span style={{ color: BRAND.warningInk, fontWeight: 600 }}> · escalated</span>}
          </span>
        </button>
        <span className="font-[family-name:var(--font-fraunces)] font-semibold flex-shrink-0" style={{ fontSize: 18, lineHeight: 1, color: BRAND.dangerInk, whiteSpace: "nowrap" }}>£{Math.round(b.burn_per_day / 1000)}k/day</span>
      </div>
      <div className="flex items-center justify-end" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onOpen} style={{ fontSize: 12, fontWeight: 500, color: BRAND.inkMuted }} className="hover:text-ink">Open trail →</button>
        {!escalated && !b.remote && (
          <button type="button" onClick={onEscalate} style={{ fontSize: 12, fontWeight: 500, color: BRAND.warningInk, border: `0.5px solid ${BRAND.warningInk}`, borderRadius: 8, padding: "5px 10px" }} className="hover:opacity-80">Escalate</button>
        )}
        <button type="button" onClick={onResolve} style={{ fontSize: 12, fontWeight: 600, color: BRAND.paperWhite, background: BRAND.successInk, borderRadius: 8, padding: "5px 10px" }} className="hover:opacity-90">Resolve</button>
      </div>
    </div>
  );
}

// Real org gate ladder, computed from DB gates + the open blockers on each.
function DbGatesView({
  gates,
  blockerMap,
  selectedGate,
  onSelectGate,
}: {
  gates: DbGate[];
  blockerMap: BlockerMap | null;
  selectedGate: string;
  onSelectGate: (id: string) => void;
}) {
  const router = useRouter();
  const baseline = loadBaseline();
  const sel =
    gates.find((g) => g.code === selectedGate) ??
    gates.find((g) => g.status === "blocked") ??
    gates[0];
  const openBlockers = blockerMap
    ? Object.values(blockerMap)
        .filter((b) => b.state !== "closed")
        .sort((a, b) => b.cost_per_day - a.cost_per_day)
    : [];
  const k = (v: number) => `£${Math.round(v / 1000)}k`;
  const blockedCount = gates.filter((g) => g.status === "blocked").length;
  const clearedCount = gates.filter((g) => g.status === "cleared").length;

  if (!sel) {
    return (
      <section className="mx-auto max-w-4xl px-8">
        <p className="text-sm text-ink-mid">No gates configured for this org.</p>
      </section>
    );
  }
  const selP = palette(sel.status);

  return (
    <section className="mx-auto max-w-4xl px-8 space-y-9">
      <div>
        <p style={eyebrow}>Commissioning gates</p>
        <h1
          className="font-[family-name:var(--font-fraunces)]"
          style={{ fontSize: 22, lineHeight: 1.35, color: BRAND.ink, marginTop: 10 }}
        >
          {clearedCount} of {gates.length} gates cleared
          {blockedCount > 0 ? (
            <>
              , <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>{blockedCount} blocking</span>.
            </>
          ) : (
            "."
          )}
        </h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {gates.map((g) => {
          const p = palette(g.status);
          const isSel = g.code === sel.code;
          return (
            <button
              key={g.code}
              type="button"
              onClick={() => onSelectGate(g.code)}
              className="text-left transition-colors"
              style={{ flex: "1 1 0", minWidth: 124, background: isSel ? p.soft : BRAND.paperWhite, border: `${isSel ? 1.5 : 0.5}px solid ${isSel ? p.ink : BRAND.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-fraunces)] font-semibold" style={{ fontSize: 18, lineHeight: 1, color: BRAND.ink }}>Gate {g.code}</span>
                <span className="inline-block flex-shrink-0 rounded-full" style={{ width: 9, height: 9, backgroundColor: p.ink }} />
              </div>
              <p style={{ fontSize: 12.5, color: BRAND.ink, marginTop: 6, lineHeight: 1.3 }}>{g.name ?? `Gate ${g.code}`}</p>
              <p style={{ ...eyebrow, color: p.ink, marginTop: 8 }}>
                {p.label}
                {g.openBlockers > 0 ? ` · ${g.openBlockers} open` : ""}
              </p>
            </button>
          );
        })}
      </div>

      <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "20px 22px" }}>
        <p style={{ ...eyebrow, color: selP.ink }}>
          Gate {sel.code} · {sel.name ?? ""}
        </p>
        {sel.status === "blocked" ? (
          <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.ink, marginTop: 8 }}>
            Blocked · <span style={{ color: BRAND.dangerInk, fontWeight: 600 }}>{k(sel.burnPerDay)}/day exposed</span> · {sel.openBlockers} open
          </h2>
        ) : sel.status === "waiting" ? (
          <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.inkMuted, marginTop: 8 }}>
            Waiting on an earlier gate{sel.target_date ? ` · target ${sel.target_date}` : ""}
          </h2>
        ) : (
          <h2 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 20, lineHeight: 1.35, color: BRAND.successInk, marginTop: 8 }}>
            Cleared
          </h2>
        )}

        {sel.status === "blocked" && openBlockers.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <p style={eyebrow}>What&apos;s blocking it · {openBlockers.length} open</p>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {openBlockers.map((b) => {
                const code = b.linked_assets[0] ?? "";
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => code && router.push(`/dashboard/tasks/${encodeURIComponent(code)}`)}
                    className="w-full text-left"
                    style={{ background: BRAND.paperWhite, border: `0.5px solid ${BRAND.border}`, borderRadius: 10, padding: "14px 16px", cursor: code ? "pointer" : "default" }}
                  >
                    <div className="flex items-start justify-between" style={{ gap: 16 }}>
                      <span className="min-w-0">
                        {code && <span className="font-mono" style={{ fontSize: 11, color: BRAND.purpleDeep }}>{code}</span>}
                        <span className="block" style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.45 }}>{b.description || b.id}</span>
                        <span style={{ fontSize: 11.5, color: BRAND.inkMuted }}>
                          {b.current_owner_org ? `with ${companyName(baseline, b.current_owner_org)}` : "unassigned"} · {b.state}
                        </span>
                      </span>
                      <span className="font-[family-name:var(--font-fraunces)] font-semibold flex-shrink-0" style={{ fontSize: 18, lineHeight: 1, color: BRAND.dangerInk, whiteSpace: "nowrap" }}>
                        {k(b.cost_per_day)}/day
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
