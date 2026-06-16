"use client";

import { useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

// Evidence-grade gate sign-off UI: the per-gate item breakdown (what was signed,
// who, when, and the signature itself) + the sign-off action (typed OR drawn
// signature). Identity + immutability are enforced server-side; this is the
// capture/surface layer only.

export type SignoffItem = {
  id: string;
  gate_code: string;
  item_label: string;
  status: "outstanding" | "signed";
  signed_by_name: string | null;
  signed_by_role: string | null;
  signature_kind: "typed" | "drawn" | null;
  signature_text: string | null;
  signature_url: string | null;
  signed_at: string | null;
};
export type GateSignoffData = {
  summary: { signed: number; total: number; cleared: boolean };
  items: SignoffItem[];
};

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: BRAND.inkMuted,
  fontWeight: 600,
};

function fmt(ts: string | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

export function GateSignoffPanel({
  gateCode,
  data,
  canSign,
  onSigned,
}: {
  gateCode: string;
  data: GateSignoffData | undefined;
  canSign: boolean;
  onSigned: () => void;
}) {
  const [signing, setSigning] = useState<string | null>(null); // item_label being signed

  if (!data || data.items.length === 0) {
    return (
      <div style={{ marginTop: 22 }}>
        <p style={eyebrow}>Commissioning items</p>
        <p style={{ fontSize: 13, color: BRAND.inkMuted, marginTop: 10, lineHeight: 1.55 }}>
          No commissioning items recorded for this gate yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div className="flex items-center justify-between">
        <p style={eyebrow}>Commissioning items · sign-off record</p>
        <span className="font-mono" style={{ fontSize: 11, color: BRAND.inkMuted }}>
          {data.summary.signed} / {data.summary.total} signed off
        </span>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {data.items.map((it) => {
          const signed = it.status === "signed";
          return (
            <div
              key={it.id}
              style={{
                background: BRAND.paperWhite,
                border: `0.5px solid ${signed ? BRAND.successInk : BRAND.border}`,
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div className="flex items-start justify-between" style={{ gap: 16 }}>
                <div className="min-w-0">
                  <span style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.4 }}>{it.item_label}</span>
                  {signed ? (
                    <span className="block" style={{ fontSize: 11.5, color: BRAND.inkMuted, marginTop: 4 }}>
                      ✓ Signed by <strong style={{ color: BRAND.ink }}>{it.signed_by_name ?? "—"}</strong>
                      {it.signed_by_role ? ` · ${it.signed_by_role}` : ""} · {fmt(it.signed_at)}
                    </span>
                  ) : (
                    <span className="block" style={{ fontSize: 11.5, color: BRAND.inkMuted, marginTop: 4 }}>Outstanding</span>
                  )}
                  {signed && it.signature_kind === "typed" && it.signature_text && (
                    <span
                      className="block font-[family-name:var(--font-fraunces)] italic"
                      style={{ fontSize: 16, color: BRAND.purpleDeep, marginTop: 6 }}
                    >
                      {it.signature_text}
                    </span>
                  )}
                  {signed && it.signature_kind === "drawn" && it.signature_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={it.signature_url}
                      alt="signature"
                      style={{ marginTop: 6, height: 44, background: "#fff", border: `0.5px solid ${BRAND.border}`, borderRadius: 6 }}
                    />
                  )}
                </div>
                <div className="flex-shrink-0">
                  {signed ? (
                    <span style={{ ...eyebrow, color: BRAND.successInk }}>Signed</span>
                  ) : canSign ? (
                    <button
                      type="button"
                      onClick={() => setSigning(it.item_label)}
                      style={{ fontSize: 12, fontWeight: 600, color: BRAND.paperWhite, background: BRAND.purpleDeep, borderRadius: 8, padding: "6px 12px" }}
                      className="hover:opacity-90"
                    >
                      Sign off
                    </button>
                  ) : (
                    <span style={{ ...eyebrow, color: BRAND.inkMuted }}>Outstanding</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {signing && (
        <SignoffModal
          gateCode={gateCode}
          itemLabel={signing}
          onClose={() => setSigning(null)}
          onDone={() => {
            setSigning(null);
            onSigned();
          }}
        />
      )}
    </div>
  );
}

function SignoffModal({
  gateCode,
  itemLabel,
  onClose,
  onDone,
}: {
  gateCode: string;
  itemLabel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a0f2b";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  };

  const submit = async () => {
    setErr(null);
    let body: Record<string, unknown> = { gateCode, itemLabel, signatureKind: mode };
    if (mode === "typed") {
      if (!typed.trim()) return setErr("Type your name to sign.");
      body.signatureText = typed.trim();
    } else {
      if (!hasInk.current) return setErr("Draw your signature first.");
      body.signatureDataUrl = canvasRef.current!.toDataURL("image/png");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/gates/signoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Failed (${res.status}).`);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(26,15,43,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: BRAND.paperWhite, borderRadius: 14, padding: 22, width: "100%", maxWidth: 460, border: `0.5px solid ${BRAND.border}` }}
      >
        <p style={eyebrow}>Sign off · Gate {gateCode}</p>
        <h3 className="font-[family-name:var(--font-fraunces)]" style={{ fontSize: 17, color: BRAND.ink, marginTop: 6, lineHeight: 1.35 }}>
          {itemLabel}
        </h3>
        <p style={{ fontSize: 12, color: BRAND.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
          Your name and the time are captured from your signed-in session. Once signed, this record is permanent and cannot be edited.
        </p>

        <div className="flex gap-2" style={{ marginTop: 16 }}>
          {(["typed", "drawn"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 8,
                border: `0.5px solid ${mode === m ? BRAND.purpleDeep : BRAND.border}`,
                color: mode === m ? BRAND.paperWhite : BRAND.inkMuted,
                background: mode === m ? BRAND.purpleDeep : BRAND.paperWhite,
              }}
            >
              {m === "typed" ? "Type name" : "Draw signature"}
            </button>
          ))}
        </div>

        {mode === "typed" ? (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your full name"
            className="font-[family-name:var(--font-fraunces)] italic"
            style={{ marginTop: 14, width: "100%", fontSize: 18, color: BRAND.purpleDeep, padding: "12px 14px", border: `0.5px solid ${BRAND.border}`, borderRadius: 10, outline: "none", background: "#fff" }}
          />
        ) : (
          <div style={{ marginTop: 14 }}>
            <canvas
              ref={canvasRef}
              width={400}
              height={140}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              style={{ width: "100%", height: 140, background: "#fff", border: `0.5px solid ${BRAND.border}`, borderRadius: 10, touchAction: "none", cursor: "crosshair" }}
            />
            <button type="button" onClick={clear} style={{ fontSize: 11, color: BRAND.inkMuted, marginTop: 6 }} className="hover:text-ink">
              Clear
            </button>
          </div>
        )}

        {err && <p style={{ fontSize: 12, color: BRAND.dangerInk, marginTop: 12 }}>{err}</p>}

        <div className="flex items-center justify-end gap-3" style={{ marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ fontSize: 13, color: BRAND.inkMuted }} className="hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{ fontSize: 13, fontWeight: 600, color: BRAND.paperWhite, background: BRAND.successInk, borderRadius: 8, padding: "8px 16px", opacity: busy ? 0.6 : 1 }}
            className="hover:opacity-90"
          >
            {busy ? "Signing…" : "Sign & record"}
          </button>
        </div>
      </div>
    </div>
  );
}
