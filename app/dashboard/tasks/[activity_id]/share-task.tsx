"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

// "Get updates on record" — a CAPTURE FUNNEL. Opens the native share sheet (or
// wa.me) with the task's inbound address + status, so anyone (Keldra or not) can
// email updates/photos onto the trail. Used on the dashboard panel + field screen.
export default function ShareTaskButton({
  taskCode,
  full,
}: {
  taskCode: string;
  full?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tasks/share?taskCode=${encodeURIComponent(taskCode)}`);
      const d = (await res.json().catch(() => ({}))) as {
        address?: string;
        title?: string;
        statusLine?: string;
        error?: string;
      };
      if (!res.ok || !d.address) {
        setErr(d.error ?? "Couldn't build the share link.");
        return;
      }
      const title = `${taskCode} — ${d.title}`;
      const text = `${title}\n${d.statusLine ?? ""}\n\nEmail updates and photos here — everything sent goes on the project record:\n${d.address}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, text });
          return;
        } catch {
          /* user cancelled or unsupported — fall through to wa.me */
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={full ? "" : "inline-block"}>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-colors disabled:opacity-60 ${
          full ? "min-h-[48px] w-full text-sm" : "px-3.5 py-2 text-sm"
        }`}
        style={{ borderColor: BRAND.border, color: BRAND.ink }}
      >
        <span aria-hidden>↗</span> {busy ? "…" : "Get updates on record"}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
