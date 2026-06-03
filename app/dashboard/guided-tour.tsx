"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 3-step first-load tour: Today -> the red gate -> drill into a blocker. A
// corner coachmark that drives the path; shows once (localStorage), with a
// "Take the tour" affordance to replay.

const SEEN_KEY = "keldra_tour_v1";

const STEPS = [
  { title: "Start on Today", body: "Your three director decisions and today's live burn. This is the 10-second read.", cta: "Show me Today" },
  { title: "Open the blocked gate", body: "All three decisions sit behind Gate C. Click through to see what's holding it — and the ripple onto Gates D & E.", cta: "Open Gate C" },
  { title: "Drill into a blocker", body: "Every blocker opens a full chain of custody: owner, days open, the evidence, and the AI root-cause. That's the layer above Procore.", cta: "Open a blocker" },
];

export function GuidedTour({
  onGoToday,
  onOpenGateC,
}: {
  onGoToday: () => void;
  onOpenGateC: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch {}
  }

  function advance() {
    if (step === 0) {
      onGoToday();
      setStep(1);
    } else if (step === 1) {
      onOpenGateC();
      setStep(2);
    } else {
      dismiss();
      router.push("/dashboard/tasks/ELE-COLO-1030");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setStep(0); setOpen(true); }}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-paper-line bg-paper-card px-3.5 py-2 text-xs font-medium text-ink-mid shadow-sm transition-colors hover:border-accent hover:text-accent"
      >
        ✦ Take the tour
      </button>
    );
  }

  const s = STEPS[step];
  return (
    <div className="fixed bottom-4 left-4 z-50 w-[320px] rounded-2xl border border-accent/40 bg-paper-card p-5 shadow-[0_20px_50px_-12px_rgba(26,15,43,0.35)]">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          Guided tour · {step + 1} of {STEPS.length}
        </span>
        <button type="button" onClick={dismiss} className="text-xs text-ink-mid hover:text-ink">Skip</button>
      </div>
      <h3 className="mt-2 font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 18 }}>
        {s.title}
      </h3>
      <p className="mt-1.5 text-[13px] text-ink-mid" style={{ lineHeight: 1.5 }}>{s.body}</p>
      <div className="mt-4 flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 18 : 6, background: i === step ? "var(--accent)" : "var(--paper-line, #e8dcf0)" }} />
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={advance}
          className="rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-accent-deep"
        >
          {s.cta} →
        </button>
      </div>
    </div>
  );
}
