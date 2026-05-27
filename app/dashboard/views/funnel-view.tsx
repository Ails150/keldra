"use client";

import { useState } from "react";
import Link from "next/link";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import type { BlockerMap } from "../lib/blocker-state";
import { BRAND } from "@/lib/brand";
import {
  type Baseline,
  companyColour,
  companyName,
  daysOpen,
  loadBaseline,
  recoveryTasks,
  roomByCode,
} from "../lib/baseline-seed";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// P6 Cx flow funnel. Off-site heavy — site module install doesn't begin until
// 17 Aug 26, so everything downstream is zero today.
const STAGES = [
  { label: "L1 Off-Site Verification", n: 34, legacy: "Red Tag (legacy) = L1/L2 Off-Site" },
  { label: "L2 Off-Site Acceptance", n: 18, legacy: "Red Tag (legacy) = L1/L2 Off-Site" },
  { label: "L3 Integrated Off-Site Cx", n: 8, legacy: null },
  { label: "On Site", n: 0, legacy: "Site module installation starts 17 Aug 26" },
  { label: "Pre-Energization", n: 0, legacy: "Yellow Tag (legacy) = Pre-Energization" },
  { label: "Green Tag", n: 0, legacy: "Green Tag (legacy) = Post-Energization · 02 Dec 26" },
  { label: "Beneficial Use", n: 0, legacy: "Beneficial Use · 02 Dec 26" },
];

function roomBadge(
  b: Baseline,
  code: string | null,
): { label: string; bg: string } | null {
  const r = roomByCode(b, code);
  if (!r) return null;
  const bg =
    r.tag === "BU"
      ? "bg-red-100 text-red-700"
      : r.tag === "Earth"
        ? "bg-blue-100 text-blue-800"
        : r.tag === "Security"
          ? "bg-purple-100 text-purple-800"
          : "bg-amber-100 text-amber-800";
  return { label: r.code, bg };
}

type Props = {
  project: WizardData;
  viewingAs: ViewingAs;
  blockerMap: BlockerMap | null;
  onAlertAction?: (target: string) => void;
};

export default function FunnelView({
  project: _project,
  viewingAs: _viewingAs,
  blockerMap: _blockerMap,
  onAlertAction: _onAlertAction,
}: Props) {
  const [baseline] = useState<Baseline>(() => loadBaseline());
  const max = Math.max(...STAGES.map((s) => s.n), 1);
  const recovery = recoveryTasks(baseline);

  return (
    <section className="mx-auto max-w-5xl px-8 space-y-6">
      <header>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 32, lineHeight: 1.1 }}
        >
          Commissioning Funnel
        </h1>
        <p
          className="mt-1.5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 16 }}
        >
          Microsoft / Ardmac Cx flow against the DUB-16 P6 programme.
        </p>
      </header>

      {/* RT reality, as of 24 May 26 */}
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
          Red Tag reality · as of 24 May 26
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Planned RT" value="60" />
          <Stat label="Walked RT" value="41" caption="-19, 32% miss" />
          <Stat label="Documentation uploaded" value="25" caption="-16, 38% drop" />
          <Stat label="Achieved RT (Nexus)" value="13" caption="-12, 48% drop" danger />
        </div>
      </div>

      {/* Cx-flow funnel */}
      <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
        {STAGES.map((s, i) => {
          const width = Math.max(6, (s.n / max) * 100);
          const zero = s.n === 0;
          return (
            <div key={s.label} title={s.legacy ?? undefined}>
              <div
                className="mx-auto flex h-11 items-center justify-between rounded-lg px-4 text-white"
                style={{
                  width: `${zero ? 18 : width}%`,
                  backgroundColor: zero
                    ? BRAND.slate
                    : i === 0
                      ? BRAND.teal
                      : i === 1
                        ? BRAND.blue
                        : BRAND.amber,
                  opacity: zero ? 0.5 : 1,
                }}
              >
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs opacity-90">{s.n}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="py-1 text-center text-[11px] text-ink-mid">↓</div>
              )}
            </div>
          );
        })}
        <div
          className="mt-3 rounded-xl border-2 p-4"
          style={{ borderColor: BRAND.purple, backgroundColor: "rgba(138,61,214,0.04)" }}
        >
          <p className="text-sm leading-relaxed text-ink">
            We&apos;re <span className="font-semibold">12 weeks from site install</span>{" "}
            (17 Aug 26). Everything compresses into August through December.
            Every day we lose now, we don&apos;t get back.
          </p>
        </div>
      </div>

      {/* Recovery list (Job 7) */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mid">
          Recovery list · costliest first
        </h2>
        <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
          <ul className="divide-y divide-paper-line">
            {recovery.map((t) => {
              const badge = roomBadge(baseline, t.affects_room);
              const holder = t.blocking_company ?? t.responsible_company;
              return (
                <li
                  key={t.activity_id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="w-32 flex-shrink-0 font-mono text-[11px] text-accent-deep">
                    {t.activity_id}
                  </span>
                  <span className="flex-1 truncate text-ink">{t.name}</span>
                  {badge && (
                    <span
                      className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  )}
                  <span
                    className="hidden rounded-full px-2 py-0.5 text-[10px] font-semibold text-paper md:inline"
                    style={{ backgroundColor: companyColour(baseline, holder) }}
                  >
                    {companyName(baseline, holder)}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right font-mono text-[11px] font-semibold text-red-700">
                    {GBP.format(t.cost_per_day)}/day
                  </span>
                  <span className="hidden w-16 flex-shrink-0 text-right text-[11px] text-ink-mid lg:inline">
                    {daysOpen(t)}d
                  </span>
                  <Link
                    href={`/dashboard/tasks/${t.activity_id}`}
                    className="flex-shrink-0 rounded-full bg-ink px-3 py-1 text-[10px] font-medium text-paper transition-colors hover:bg-accent"
                  >
                    Open task →
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  caption,
  danger,
}: {
  label: string;
  value: string;
  caption?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-mid">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-fraunces)] font-semibold ${danger ? "text-red-700" : "text-ink"}`}
        style={{ fontSize: 30, lineHeight: 1 }}
      >
        {value}
      </p>
      {caption && (
        <p
          className={`mt-0.5 text-[11px] ${danger ? "font-semibold text-red-700" : "text-ink-mid"}`}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
