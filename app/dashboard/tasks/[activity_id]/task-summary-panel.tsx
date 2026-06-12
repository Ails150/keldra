"use client";

import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";

type Summary = {
  where: string;
  changed: string;
  insight: string;
  entryCount: number;
  generatedAt: string;
  source: string;
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Live, single source of task insight. For an authenticated org it shows the
// regenerated 3-part summary; for the anonymous demo (401/403) it renders the
// provided static fallback so the demo keeps its polished analysis.
export default function TaskSummaryPanel({
  taskCode,
  fallback,
}: {
  taskCode: string;
  fallback: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"loading" | "live" | "fallback">("loading");
  const [sum, setSum] = useState<Summary | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(
    async (force?: boolean) => {
      try {
        const res = await fetch(
          `/api/tasks/summary?taskCode=${encodeURIComponent(taskCode)}${force ? "&force=1" : ""}`,
        );
        if (!res.ok) {
          setPhase("fallback");
          return;
        }
        setSum((await res.json()) as Summary);
        setPhase("live");
      } catch {
        setPhase("fallback");
      }
    },
    [taskCode],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "loading") {
    return (
      <div style={{ backgroundColor: "#f6f0fc", border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <p style={{ fontSize: 12, color: BRAND.inkMuted }}>✦ Generating task summary…</p>
      </div>
    );
  }
  if (phase === "fallback" || !sum) return <>{fallback}</>;

  return (
    <div style={{ backgroundColor: "#f6f0fc", border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "16px 20px" }}>
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span style={{ color: BRAND.purple, fontSize: 13, lineHeight: 1 }}>✦</span>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.purple, fontWeight: 600 }}>
            Task summary · AI
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span style={{ fontSize: 9, fontStyle: "italic", color: BRAND.inkMuted }}>
            Updated {ago(sum.generatedAt)} · from {sum.entryCount} {sum.entryCount === 1 ? "entry" : "entries"}
            {sum.source === "rules" ? " · rules" : ""}
          </span>
          <button
            type="button"
            onClick={async () => {
              setRegenerating(true);
              await load(true);
              setRegenerating(false);
            }}
            disabled={regenerating}
            className="rounded text-[10px] font-medium"
            style={{ color: BRAND.purple }}
          >
            {regenerating ? "…" : "Regenerate"}
          </button>
        </div>
      </div>

      <Section label="Where this stands" body={sum.where} />
      <Section label="What changed recently" body={sum.changed} />
      <div style={{ marginTop: 12, borderLeft: `2px solid ${BRAND.purple}`, paddingLeft: 10 }}>
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.purple, fontWeight: 600 }}>
          The insight · next move
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, lineHeight: 1.45, marginTop: 4 }}>{sum.insight}</p>
      </div>
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  if (!body) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 13, color: BRAND.ink, lineHeight: 1.5, marginTop: 4 }}>{body}</p>
    </div>
  );
}
