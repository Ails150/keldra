"use client";

import {
  type Blocker,
  type BlockerMap,
  awaitingInputOver48h,
  daysInState,
  escalatedBlockers,
  starredBlockers,
  totalDailyExposure,
  unownedBlockers,
} from "../lib/blocker-state";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

type Props = {
  map: BlockerMap;
  onOpen: (id: string) => void;
};

export default function TodayRitual({ map, onOpen }: Props) {
  const unowned = unownedBlockers(map);
  const awaiting = awaitingInputOver48h(map);
  const escalated = escalatedBlockers(map);
  const exposure = totalDailyExposure(map);

  const hour = new Date().getHours();
  const showEvening = hour >= 16;

  return (
    <section className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
            Your morning review
          </p>
          <h2
            className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 24, lineHeight: 1.15 }}
          >
            Today&apos;s blockers to sit on
          </h2>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mid">
            Total exposure today
          </p>
          <p
            className="font-[family-name:var(--font-fraunces)] font-semibold text-red-700"
            style={{ fontSize: 28, lineHeight: 1 }}
          >
            {GBP.format(exposure)}/day
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Column
          label="Unowned"
          tone="red"
          items={unowned}
          onOpen={onOpen}
          emptyHint="Everything's owned. Nice."
        />
        <Column
          label="Awaiting input > 48h"
          tone="amber"
          items={awaiting}
          onOpen={onOpen}
          emptyHint="Nothing stuck in their court."
        />
        <Column
          label="Escalated"
          tone="red"
          items={escalated}
          onOpen={onOpen}
          emptyHint="No PM escalations open."
        />
      </div>

      {showEvening && <EveningReview map={map} onOpen={onOpen} />}
    </section>
  );
}

function Column({
  label,
  tone,
  items,
  onOpen,
  emptyHint,
}: {
  label: string;
  tone: "red" | "amber";
  items: Blocker[];
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  const headerTone =
    tone === "red"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-800";

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card overflow-hidden">
      <div
        className={`flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider ${headerTone}`}
      >
        <span>{label}</span>
        <span>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs italic text-ink-mid">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-paper-line">
          {items.map((b) => {
            const dis = daysInState(b);
            return (
              <li key={b.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] text-ink-mid">
                      {b.id}
                    </p>
                    <p className="mt-0.5 text-sm text-ink leading-snug line-clamp-2">
                      {b.description || "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-ink-mid">
                    {dis} {dis === 1 ? "day" : "days"} ·{" "}
                    <span className="font-medium text-red-700">
                      {GBP.format(b.cost_per_day)}/day
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(b.id)}
                    className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium text-paper transition-colors hover:bg-accent"
                  >
                    Open
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EveningReview({
  map,
  onOpen,
}: {
  map: BlockerMap;
  onOpen: (id: string) => void;
}) {
  const starred = starredBlockers(map);
  const closedToday = starred.filter(
    (b) => b.state === "verified" || b.state === "closed",
  );
  const stillOpen = starred.filter(
    (b) => !(b.state === "verified" || b.state === "closed"),
  );
  const totalSavings = closedToday.reduce(
    (sum, b) => sum + b.cost_per_day * 1,
    0,
  );

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-warm/40 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
            Your evening review
          </p>
          <h3
            className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 20, lineHeight: 1.15 }}
          >
            Closed today: {closedToday.length} of {starred.length}
          </h3>
        </div>
        {closedToday.length > 0 && (
          <p
            className="font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 13 }}
          >
            Main Contractor moved {closedToday.length} of {starred.length} today,{" "}
            {GBP.format(totalSavings)} of delay closed.
          </p>
        )}
      </div>

      {starred.length === 0 ? (
        <p className="mt-3 text-xs italic text-ink-mid">
          Nothing was starred this morning — pick a few first thing tomorrow.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {[...closedToday, ...stillOpen].map((b) => {
            const moved = b.state === "verified" || b.state === "closed";
            return (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-xl bg-paper-card px-3 py-2"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    moved ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="font-mono text-[10px] text-ink-mid">
                  {b.id}
                </span>
                <span className="flex-1 truncate text-sm text-ink">
                  {b.description || "—"}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(b.id)}
                  className="text-[11px] font-medium text-accent hover:text-accent-deep"
                >
                  Open →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
