"use client";

import { useMemo, useState } from "react";
import { useDemo } from "./demo-store";

// Header controls for the live demo loop: a Field-mode capture (raise a red tag
// against an asset) and a Reset that restores the opening scenario. Both drive
// the shared store, so every surface updates the instant they fire.
export function DemoControls() {
  const { raiseTag, reset } = useDemo();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent-deep"
        title="Field mode — raise a red tag on site"
      >
        <span aria-hidden>＋</span> Field capture
      </button>
      <button
        type="button"
        onClick={() => reset()}
        className="hidden md:inline-flex items-center rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-xs font-medium text-ink-mid transition-colors hover:border-accent hover:text-accent"
        title="Restore the opening demo scenario"
      >
        ↺ Reset demo
      </button>
      {open && <FieldCaptureModal onClose={() => setOpen(false)} onSubmit={raiseTag} />}
    </>
  );
}

function FieldCaptureModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (assetId: string, note: string) => void;
}) {
  const { rawAssets } = useDemo();
  // Offer commissioned COLO assets — flipping one to red-tag is visible everywhere.
  const pickable = useMemo(
    () =>
      rawAssets
        .filter((a) => a.current_stage === "On GT" && a.location.startsWith("Colo Hall"))
        .slice(0, 12),
    [rawAssets],
  );
  const [assetId, setAssetId] = useState(pickable[0]?.asset_id ?? rawAssets[0]?.asset_id ?? "");
  const [note, setNote] = useState("Leak detected at CRAH connection — needs re-tag");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-paper-line bg-paper-card p-6 shadow-[0_24px_60px_-12px_rgba(26,15,43,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          Field mode · on-site capture
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 22 }}>
          Raise a red tag
        </h2>
        <p className="mt-1 text-sm text-ink-mid">
          A foreman flags a defect. Watch Today, Assets, Gate C and the Audit trail update the moment you submit.
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-ink-mid">Asset</label>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink"
        >
          {pickable.map((a) => (
            <option key={a.asset_id} value={a.asset_id}>
              {a.asset_id} · {a.asset_type} · {a.location}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-mid">What did you find?</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1.5 w-full resize-none rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-sm text-ink"
        />

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-ink-mid hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (assetId) onSubmit(assetId, note);
              onClose();
            }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
          >
            Submit red tag
          </button>
        </div>
      </div>
    </div>
  );
}
