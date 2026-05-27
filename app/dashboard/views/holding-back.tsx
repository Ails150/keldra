"use client";

import { useMemo, useState } from "react";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { BRAND } from "@/lib/brand";
import { getInitials } from "../utils";
import {
  type Baseline,
  type BaselineTask,
  companyRollups,
  daysOpen,
  holdingCompany,
  loadBaseline,
} from "../lib/baseline-seed";
import { type Chain, chainFor, terminalCounts, terminalLabel } from "@/lib/chains";
import PersonDetailPanel from "./person-detail-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onOpenBlocker: (id: string) => void;
};

function daysColour(d: number): string {
  return d > 30 ? BRAND.dangerInk : d >= 14 ? BRAND.warningInk : BRAND.inkMuted;
}

export default function HoldingBackView({
  project,
  viewingAs,
  blockerMap,
  onOpenBlocker,
}: Props) {
  const [baseline] = useState<Baseline>(() => loadBaseline());
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);

  const groups = useMemo(() => {
    return companyRollups(baseline).map((r) => {
      const blockers = baseline.tasks
        .filter((t) => holdingCompany(t) === r.company.slug)
        .sort((a, b) => b.cost_per_day - a.cost_per_day);
      return { rollup: r, blockers };
    });
  }, [baseline]);

  const allBlockers = groups.flatMap((g) => g.blockers);
  const totalBurn = groups.reduce((s, g) => s + g.rollup.totalPerDay, 0);
  const companyCount = groups.length;
  const blockerCount = allBlockers.length;

  const oldest = allBlockers
    .map((t) => ({ t, d: daysOpen(t) }))
    .sort((a, b) => b.d - a.d)[0];

  const terminals = terminalCounts(allBlockers.map((t) => t.activity_id));
  const terminalTop = terminals[0];
  const maxTerminal = terminals.reduce((m, x) => Math.max(m, x.count), 1);

  return (
    <section className="mx-auto max-w-4xl px-8 space-y-4">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold"
          style={{ fontSize: 28, lineHeight: 1.1, color: BRAND.ink }}
        >
          Who&apos;s holding DUB-16 back
        </h1>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] italic"
          style={{ fontSize: 14, color: BRAND.inkMuted }}
        >
          {blockerCount} active blockers across {companyCount} companies · total burn £
          {Math.round(totalBurn / 1000)}k/day
        </p>
      </header>

      {/* Block A — summary strip */}
      <div
        className="flex items-stretch"
        style={{ backgroundColor: BRAND.ink, color: BRAND.cream, borderRadius: 12, padding: "18px 24px" }}
      >
        <SummaryCol
          eyebrow="Total burn"
          big={`£${Math.round(totalBurn / 1000)}k/day`}
          bigColour={BRAND.dangerInk}
          sub={`Across ${companyCount} companies`}
        />
        <Divider />
        <SummaryCol
          eyebrow="Oldest blocker"
          big={oldest ? `${oldest.d}d open` : "—"}
          bigColour={BRAND.cream}
          sub={
            oldest
              ? `${oldest.t.activity_id} held by ${groupHolder(baseline, oldest.t)}`
              : "No active blockers"
          }
        />
        <Divider />
        <SummaryCol
          eyebrow="Where chain lands"
          big={terminalTop ? terminalTop.entity : "—"}
          bigColour={BRAND.warningInk}
          sub={
            terminalTop
              ? `${terminalTop.count} blockers ultimately trace back here`
              : "No chains mapped"
          }
        />
      </div>

      {/* Block B — company groups */}
      {groups.map(({ rollup, blockers }) => (
        <div
          key={rollup.company.slug}
          className="bg-white"
          style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "20px 24px" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center rounded-full font-bold"
                style={{ width: 28, height: 28, fontSize: 10, backgroundColor: BRAND[rollup.company.colour], color: BRAND.cream }}
              >
                {rollup.company.name.slice(0, 2).toUpperCase()}
              </span>
              <h2
                className="font-[family-name:var(--font-fraunces)]"
                style={{ fontSize: 18, color: BRAND.ink }}
              >
                {rollup.company.name}
              </h2>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: BRAND.cream, color: BRAND.inkMuted, border: `0.5px solid ${BRAND.border}` }}
              >
                {rollup.company.role}
              </span>
            </div>
            <div className="text-right">
              <p
                className="font-[family-name:var(--font-fraunces)] font-semibold"
                style={{ fontSize: 20, lineHeight: 1, color: BRAND.dangerInk }}
              >
                £{Math.round(rollup.totalPerDay / 1000)}k/day
              </p>
              <p style={{ fontSize: 11, color: BRAND.inkMuted, marginTop: 2 }}>
                {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {blockers.map((t) => {
              const d = daysOpen(t);
              const chain = chainFor(t.activity_id);
              return (
                <div key={t.activity_id} style={{ marginBottom: 8 }}>
                  {/* blocker headline row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono" style={{ fontSize: 11, color: BRAND.ink }}>
                        {t.activity_id}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink }}>{t.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{ fontSize: 11, color: daysColour(d), backgroundColor: BRAND.cream }}
                      >
                        {d}d open
                      </span>
                    </div>
                    <span className="flex-shrink-0 font-mono" style={{ fontSize: 14, color: BRAND.dangerInk }}>
                      £{Math.round(t.cost_per_day / 1000)}k/day
                    </span>
                  </div>

                  {/* accountable person */}
                  <div style={{ marginLeft: 16, marginTop: 8 }}>
                    <AccountablePerson
                      chain={chain}
                      companyColourHex={BRAND[rollup.company.colour]}
                      onOpen={(person) => setSelectedPerson(person)}
                    />

                    {/* dependency chain */}
                    {chain ? (
                      <div
                        style={{ marginLeft: 16, marginTop: 8, padding: 12, borderLeft: `2px solid ${BRAND.warningInk}` }}
                      >
                        <p
                          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}
                        >
                          Dependency chain
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {chain.steps.map((s, i) => {
                            const isLast = i === chain.steps.length - 1;
                            const dur =
                              s.days != null ? `${s.days}d` : s.label ? s.label : "";
                            return (
                              <div key={i} className="flex items-baseline gap-2" style={{ fontSize: 12, color: BRAND.inkMuted }}>
                                <span style={{ flex: "1 1 0%", minWidth: 0 }}>
                                  └─ {s.actor} is waiting on {s.waitingOn}
                                  {s.what ? ` for ${s.what}` : ""}
                                  {dur ? ` · ${dur}` : ""}
                                </span>
                                {isLast && (
                                  <span
                                    className="flex-shrink-0 rounded-full px-2 py-0.5 font-semibold"
                                    style={{ fontSize: 9, letterSpacing: "0.08em", backgroundColor: BRAND.dangerBg, color: BRAND.dangerInk }}
                                  >
                                    ORIGIN
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-2 italic" style={{ fontSize: 12, color: BRAND.dangerInk }}>
                          The real blocker lives at: {terminalLabel(chain)}
                        </p>
                      </div>
                    ) : (
                      <p style={{ marginLeft: 16, marginTop: 8, fontSize: 12, color: BRAND.inkMuted, fontStyle: "italic" }}>
                        Chain not yet mapped — pilot week 1 maps the full chain.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Block C — where chains terminate */}
      {terminals.length > 0 && (
        <div
          className="bg-white"
          style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "18px 20px" }}
        >
          <p
            style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}
          >
            Where chains terminate
          </p>
          <div className="mt-3 space-y-2">
            {terminals.map((x) => (
              <div key={x.entity} className="flex items-center gap-3">
                <span style={{ fontSize: 13, color: BRAND.ink, width: 150, flexShrink: 0 }}>{x.entity}</span>
                <div className="flex-1">
                  <div
                    style={{
                      height: 16,
                      width: `${Math.max(8, (x.count / maxTerminal) * 100)}%`,
                      backgroundColor: BRAND.warningInk,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span className="font-mono flex-shrink-0" style={{ fontSize: 12, color: BRAND.inkMuted, width: 24, textAlign: "right" }}>
                  {x.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PersonDetailPanel
        person={selectedPerson}
        project={project}
        blockerMap={blockerMap}
        viewingAs={viewingAs}
        onClose={() => setSelectedPerson(null)}
        onOpenBlocker={onOpenBlocker}
      />
    </section>
  );
}

function groupHolder(b: Baseline, t: BaselineTask): string {
  const slug = holdingCompany(t);
  return b.companies.find((c) => c.slug === slug)?.name ?? slug ?? "—";
}

function AccountablePerson({
  chain,
  companyColourHex,
  onOpen,
}: {
  chain: Chain | undefined;
  companyColourHex: string;
  onOpen: (person: any) => void;
}) {
  if (!chain) {
    return (
      <div style={{ backgroundColor: BRAND.cream, borderRadius: 6, padding: "10px 12px" }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}>
          Accountable person
        </p>
        <p style={{ fontSize: 12, color: BRAND.inkMuted, marginTop: 4 }}>
          Not yet mapped.
        </p>
      </div>
    );
  }
  const a = chain.accountable;
  const person = { name: a.name, organisation: a.org, role: a.role };
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className="w-full text-left transition-colors"
      style={{ backgroundColor: BRAND.cream, borderRadius: 6, padding: "10px 12px" }}
    >
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}>
        Accountable person
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-full font-bold"
          style={{ width: 22, height: 22, fontSize: 9, backgroundColor: companyColourHex, color: BRAND.cream }}
        >
          {getInitials(a.name)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink }}>{a.name}</span>
        <span style={{ fontSize: 11, color: BRAND.inkMuted }}>{a.role}</span>
      </div>
      <span style={{ fontSize: 11, color: BRAND.purple, display: "inline-block", marginTop: 6 }}>
        View kept-rate diagnostic →
      </span>
    </button>
  );
}

function Divider() {
  return (
    <div
      className="mx-5 self-stretch"
      style={{ width: "0.5px", backgroundColor: BRAND.cream, opacity: 0.2 }}
    />
  );
}

function SummaryCol({
  eyebrow,
  big,
  bigColour,
  sub,
}: {
  eyebrow: string;
  big: string;
  bigColour: string;
  sub: string;
}) {
  return (
    <div className="flex-1">
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.cream, opacity: 0.7 }}>
        {eyebrow}
      </p>
      <p
        className="font-[family-name:var(--font-fraunces)] font-semibold"
        style={{ fontSize: 28, lineHeight: 1.15, marginTop: 4, color: bigColour }}
      >
        {big}
      </p>
      <p style={{ fontSize: 11, marginTop: 4, color: BRAND.cream, opacity: 0.7 }}>{sub}</p>
    </div>
  );
}
