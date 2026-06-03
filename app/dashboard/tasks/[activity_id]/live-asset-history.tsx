"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { type Activity } from "@/lib/activity";
import { ActivityTimeline } from "../../activity-ui";
import {
  escalateRedTag,
  listAssetHistory,
  logEntry,
  signedPhotoUrl,
  subscribeFieldEvents,
  type MerFieldEvent,
} from "@/lib/supabase/mer-field";

type Row = MerFieldEvent & { photoUrl?: string | null };

const KIND_LABEL: Record<string, string> = {
  red_tag: "Red tag raised", escalated: "Escalated", response: "Reply", comment: "Comment", photo: "Photo", update: "Update", resolved: "Resolved",
};

// Map a logged history row to the shape ActivityTimeline already renders.
function toActivity(e: Row): Activity {
  const direction = e.kind === "escalated" ? "outbound" : e.kind === "response" ? "inbound" : "internal";
  const type = e.kind === "escalated" ? "chase" : e.kind === "response" ? "response" : e.kind === "resolved" ? "status_change" : e.kind === "red_tag" ? "status_change" : "note";
  const body = e.comment || (e.kind === "red_tag" ? `Red tag raised${e.with_party ? ` — with ${e.with_party}` : ""}` : e.kind === "escalated" ? `Escalated to ${e.role ?? "director"}` : KIND_LABEL[e.kind] || e.kind);
  return {
    id: e.id,
    task_id: e.asset_id ?? "",
    project_id: "MER",
    type,
    direction,
    channel: e.kind === "red_tag" || e.kind === "photo" ? "site_visit" : "keldra",
    actor: { name: e.actor, company_slug: "", role: e.role ?? "" },
    recipient: null,
    subject: e.kind === "red_tag" ? `${KIND_LABEL.red_tag}${e.with_party ? ` · with ${e.with_party}` : ""}` : null,
    body,
    attachments: [],
    metadata: { ...(e.kind === "red_tag" ? { new_status: "Red tag" } : {}), ...(e.kind === "resolved" ? { new_status: "Resolved" } : {}), photo_url: e.photoUrl ?? undefined },
    created_at: e.created_at,
    created_by: e.actor,
  };
}

export default function LiveAssetHistory({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const rootIdRef = useRef<string | null>(null);

  const sign = useCallback(async (e: MerFieldEvent): Promise<Row> => ({ ...e, photoUrl: await signedPhotoUrl(e.photo_path).catch(() => null) }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await listAssetHistory(assetId);
        const withUrls = await Promise.all(hist.map(sign));
        if (!cancelled) { setRows(withUrls); rootIdRef.current = hist.find((h) => h.kind === "red_tag")?.id ?? hist[0]?.id ?? null; }
      } catch (err) {
        console.warn("history load failed:", (err as Error)?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsub = subscribeFieldEvents({
      onInsert: async (e) => { if (e.asset_id !== assetId) return; const r = await sign(e); setRows((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, r])); if (!rootIdRef.current && e.kind === "red_tag") rootIdRef.current = e.id; },
      onDelete: (id) => setRows((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsub(); };
  }, [assetId, sign]);

  const ordered = useMemo(() => rows.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)), [rows]);
  const entries = useMemo(() => ordered.map(toActivity), [ordered]);
  const redTag = ordered.find((r) => r.kind === "red_tag");
  const withParty = redTag?.with_party;

  function doEscalate() {
    const parentId = rootIdRef.current ?? redTag?.id;
    if (parentId) void escalateRedTag({ assetId, parentId, toRole: "Operations Director" });
  }
  function sendReply() {
    if (!reply.trim()) return;
    const parentId = rootIdRef.current ?? redTag?.id ?? undefined;
    void logEntry({ assetId, kind: "response", comment: reply.trim(), actor: "Commissioning Lead", role: "PM", parentId });
    setReply(""); setReplyOpen(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-10">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">← Back to dashboard</Link>

      <header className="mt-4">
        <p className="font-mono text-sm text-accent-deep">{assetId}</p>
        <h1 className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 28, lineHeight: 1.15 }}>
          {redTag?.comment || "Field red tag"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {withParty && <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">With: {withParty}</span>}
          <span className="rounded-full bg-paper-warm px-2.5 py-1 text-ink-mid">Gate {redTag?.gate ?? "C"}</span>
          <span className="rounded-full bg-paper-warm px-2.5 py-1 text-ink-mid">{ordered.length} log {ordered.length === 1 ? "entry" : "entries"}</span>
          <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">● live · Supabase</span>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={doEscalate} className="rounded-xl px-4 py-2 text-sm font-medium text-paper" style={{ backgroundColor: BRAND.warningInk }}>
          Escalate to Operations Director
        </button>
        <button type="button" onClick={() => setReplyOpen((v) => !v)} className="rounded-xl border border-paper-line bg-paper-card px-4 py-2 text-sm font-medium text-ink hover:border-accent">
          ＋ Add reply
        </button>
      </div>
      {replyOpen && (
        <div className="mt-3 flex gap-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply on this item…" className="flex-1 rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          <button type="button" onClick={sendReply} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accent-deep">Send</button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
        <div className="border-b border-paper-line bg-paper-warm px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-mid">
          Logged history · live · cross-device
        </div>
        {loading ? (
          <p className="px-5 py-6 text-[13px] text-ink-mid">Loading history…</p>
        ) : (
          <ActivityTimeline entries={entries} />
        )}
      </div>
    </main>
  );
}
