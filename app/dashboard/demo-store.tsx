"use client";

// Demo live loop. The scripted £73k scenario is in-memory (escalate/resolve/
// reset). Field history is REAL: /field logs entries to Supabase against an
// asset; this provider loads + subscribes and merges them so Gate C's blocking
// list, Today, Assets, the live burn and Audit update cross-device, no refresh.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generateAssets, type DemoAsset } from "./lib/demo-assets";
import {
  clearFieldEvents,
  deleteFieldEvent,
  escalateRedTag,
  listFieldEvents,
  signedPhotoUrl,
  subscribeFieldEvents,
  type MerFieldEvent,
} from "@/lib/supabase/mer-field";

export type BlockerStatus = "open" | "escalated" | "resolved";

export type LiveBlocker = {
  id: string;
  asset_id: string;
  title: string;
  system: string;
  owner_role: string;
  owner_org: string; // "who it's with"
  status: BlockerStatus;
  raised_by: string;
  raised_at: string;
  burn_per_day: number;
  root: string;
  gate: string;
  remote?: boolean;
};

export type AuditEntry = { id: string; ts: string; actor: string; action: string; detail: string };
export type Change = { id: string; ts: string; icon: string; text: string; photoUrl?: string | null; live?: boolean };
type RemoteEvent = MerFieldEvent & { photoUrl?: string | null };

const DEMO_TODAY = "2026-05-28";
function offset(days: number): string {
  const d = new Date(DEMO_TODAY + "T08:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function openingBlockers(): LiveBlocker[] {
  return [
    { id: "ELE-COLO-1030", asset_id: "MER-COLO1-RIO31", title: "Telecoms bracketery — COLO 1-4", system: "Power", owner_role: "Site Lead", owner_org: "MEP Sub", status: "open", raised_by: "Commissioning Lead", raised_at: offset(-19), burn_per_day: 20000, root: "Hyperscale Client", gate: "C" },
    { id: "ELE-MER-1010", asset_id: "MER-COLO1-BUS30", title: "MER1 earth bar — unstaffed", system: "Power", owner_role: "Site Manager", owner_org: "Main Contractor", status: "open", raised_by: "Commissioning Lead", raised_at: offset(-15), burn_per_day: 18000, root: "Main Contractor", gate: "C" },
    { id: "MEC-COLO-1040", asset_id: "MER-COLO1-CHWP24", title: "Water services — Status A sign-off", system: "Cooling", owner_role: "Design Director", owner_org: "Design House", status: "open", raised_by: "Commissioning Lead", raised_at: offset(-21), burn_per_day: 15000, root: "Hyperscale Client", gate: "C" },
    { id: "FAB-ADMIN-1120", asset_id: "MER-COLO1-AHU22", title: "External steel — lighting spec unsigned", system: "Cooling", owner_role: "Drawings Lead", owner_org: "Drawings Office", status: "open", raised_by: "Project Engineer", raised_at: offset(-25), burn_per_day: 9000, root: "Hyperscale Client", gate: "C" },
    { id: "ELE-COLO-1031", asset_id: "MER-COLO1-CRAC21", title: "SCCR cabling — downstream of 1030", system: "Power", owner_role: "Site Lead", owner_org: "MEP Sub", status: "open", raised_by: "Commissioning Lead", raised_at: offset(-12), burn_per_day: 6000, root: "Hyperscale Client", gate: "C" },
    { id: "PRO-1110", asset_id: "MER-COLO1-HRU25", title: "Sprinkler diesel genset — delivery slipped", system: "Cooling", owner_role: "Procurement Lead", owner_org: "Sprinkler Sub", status: "open", raised_by: "Project Engineer", raised_at: offset(-30), burn_per_day: 3000, root: "Supplier", gate: "C" },
    { id: "SEC-COLO-1000", asset_id: "MER-COLO1-EWSD33", title: "FOK door types — awaiting sign-off", system: "Fire", owner_role: "Design Engineer", owner_org: "Design House", status: "open", raised_by: "Project Engineer", raised_at: offset(-18), burn_per_day: 2000, root: "Hyperscale Client", gate: "C" },
  ];
}
function openingAudit(): AuditEntry[] {
  return [
    { id: "a-seed-2", ts: offset(-1), actor: "Commissioning Lead", action: "Gate B cleared", detail: "Power distribution live — 18/18 tags signed off" },
    { id: "a-seed-1", ts: offset(-3), actor: "Keldra", action: "Baseline ingested", detail: "MER Cx programme rev 21-Apr-26 — chain initialised" },
  ];
}
function openingChanges(): Change[] {
  return [
    { id: "c-seed-2", ts: offset(-1), icon: "△", text: "BU forecast slipped +4 days — now 20 Dec" },
    { id: "c-seed-1", ts: offset(-1), icon: "●", text: "2 new blockers logged — burn £68k → £73k/day" },
  ];
}

type ScriptedState = { assets: DemoAsset[]; blockers: LiveBlocker[]; audit: AuditEntry[]; changes: Change[] };
function initialScripted(): ScriptedState {
  return { assets: generateAssets(), blockers: openingBlockers(), audit: openingAudit(), changes: openingChanges() };
}

export type GateView = { id: string; tagsDone: number; tagsTotal: number; status: "cleared" | "blocked" | "waiting" | "ready"; burnPerDay: number; openCount: number };

export type DemoApi = {
  assets: DemoAsset[];
  changes: Change[];
  audit: AuditEntry[];
  openBlockers: LiveBlocker[];
  burnPerDay: number;
  gateC: GateView;
  gateDE: "waiting" | "ready";
  rootRollup: { root: string; count: number }[];
  rawAssets: DemoAsset[];
  raiseTag: (assetId: string, note: string) => Promise<void>;
  escalate: (blockerId: string, toRole: string) => void;
  resolve: (blockerId: string) => void;
  reset: () => void;
};

const DemoCtx = createContext<DemoApi | null>(null);
let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
const nowIso = () => new Date().toISOString();
const GATE_C_TOTAL = 20;

function remoteToBlocker(e: RemoteEvent): LiveBlocker {
  return { id: `RT-${e.id}`, asset_id: e.asset_id ?? "", title: e.comment || "Red tag raised on site", system: "", owner_role: "Waiting on", owner_org: e.with_party || "Unassigned", status: "open", raised_by: e.actor, raised_at: e.created_at, burn_per_day: e.burn_per_day, root: e.with_party ? `${e.with_party} (field)` : "On site (field)", gate: e.gate || "C", remote: true };
}
function remoteToChange(e: RemoteEvent): Change {
  const at = e.asset_id || "site";
  const base = { id: `c-${e.id}`, ts: e.created_at, photoUrl: e.photoUrl, live: true };
  switch (e.kind) {
    case "escalated": return { ...base, icon: "⚠", text: `${at} escalated to ${e.role ?? "director"} (field item)` };
    case "comment": return { ...base, icon: "💬", text: `Comment on ${at}${e.comment ? `: ${e.comment}` : ""}` };
    case "photo": return { ...base, icon: "📷", text: `Photo added on ${at}` };
    case "update": return { ...base, icon: "✎", text: `Update on ${at}${e.comment ? `: ${e.comment}` : ""}` };
    case "response": return { ...base, icon: "↩", text: `Reply on ${at}${e.comment ? `: ${e.comment}` : ""}` };
    case "resolved": return { ...base, icon: "✅", text: `${at} resolved` };
    default: return { ...base, icon: "🔴", text: `Red tag on ${at}${e.comment ? `: ${e.comment}` : ""}${e.with_party ? ` · with ${e.with_party}` : ""} — burn +£${Math.round(e.burn_per_day / 1000)}k/day` };
  }
}
function remoteToAudit(e: RemoteEvent): AuditEntry {
  const at = e.asset_id || "site";
  const action = e.kind === "red_tag" ? "Raised red tag (field)" : e.kind === "escalated" ? "Escalated blocker" : `Logged ${e.kind}`;
  const detail = `${at}${e.with_party ? ` · with ${e.with_party}` : ""}${e.comment ? ` — ${e.comment}` : ""}`;
  return { id: `a-${e.id}`, ts: e.created_at, actor: e.actor, action, detail };
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<ScriptedState>(initialScripted);
  const [remote, setRemote] = useState<RemoteEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};

    // Authoritative re-fetch — replaces the set, catching anything missed while
    // the tab was backgrounded (realtime drops messages it didn't deliver).
    const loadRemote = async () => {
      try {
        const events = await listFieldEvents();
        const withUrls = await Promise.all(events.map(async (e) => ({ ...e, photoUrl: await signedPhotoUrl(e.photo_path).catch(() => null) })));
        if (!cancelled) setRemote(withUrls);
      } catch (err) {
        console.warn("mer field load skipped:", (err as Error)?.message);
      }
    };
    const resubscribe = () => {
      try { unsub(); } catch {}
      try {
        unsub = subscribeFieldEvents({
          onInsert: async (e) => {
            const photoUrl = await signedPhotoUrl(e.photo_path).catch(() => null);
            setRemote((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, { ...e, photoUrl }]));
          },
          onDelete: (id) => setRemote((prev) => prev.filter((x) => x.id !== id)),
        });
      } catch (err) {
        console.warn("mer realtime subscribe skipped:", (err as Error)?.message);
      }
    };
    // Realtime is an additive layer; re-fetch + re-subscribe on focus/visibility
    // so a backgrounded dashboard catches up within ~1s with no manual reload.
    const resync = () => { void loadRemote(); resubscribe(); };
    resync();
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", resync);

    return () => {
      cancelled = true;
      try { unsub(); } catch {}
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", resync);
    };
  }, []);

  const log = useCallback((st: ScriptedState, actor: string, action: string, detail: string, change?: Change): ScriptedState => ({
    ...st,
    audit: [{ id: nextId("a"), ts: nowIso(), actor, action, detail }, ...st.audit],
    changes: change ? [change, ...st.changes] : st.changes,
  }), []);

  // Header capture stays LOCAL/instant (solo demos need no backend). The real
  // cross-device path is /field -> Supabase -> Realtime (merged below).
  const raiseTag = useCallback(async (assetId: string, note: string) => {
    setS((st) => {
      const burn = 4000;
      const blocker: LiveBlocker = { id: nextId("FIELD"), asset_id: assetId, title: note?.trim() || "Red tag raised on site", system: "", owner_role: "Waiting on", owner_org: "On site", status: "open", raised_by: "Field — Site Lead", raised_at: nowIso(), burn_per_day: burn, root: "On site (new)", gate: "C" };
      const assets = st.assets.map((a) => a.asset_id === assetId ? { ...a, current_stage: "RT", red_tag_date: DEMO_TODAY, notes: "Red tag raised in field" } : a);
      return log({ ...st, assets, blockers: [blocker, ...st.blockers] }, "Field — Site Lead", "Raised red tag", `${assetId}${note?.trim() ? " — " + note.trim() : ""}`,
        { id: nextId("c"), ts: nowIso(), icon: "🔴", text: `Red tag on ${assetId} — burn +£4k/day`, live: true });
    });
  }, [log]);

  const escalate = useCallback((blockerId: string, toRole: string) => {
    if (blockerId.startsWith("RT-")) {
      const eventId = blockerId.slice(3);
      const ev = remote.find((x) => x.id === eventId);
      if (ev?.asset_id) void escalateRedTag({ assetId: ev.asset_id, parentId: eventId, toRole });
      return;
    }
    setS((st) => {
      const b = st.blockers.find((x) => x.id === blockerId);
      if (!b || b.status === "resolved") return st;
      const blockers = st.blockers.map((x) => x.id === blockerId ? { ...x, status: "escalated" as BlockerStatus, owner_role: toRole } : x);
      return log({ ...st, blockers }, "Commissioning Lead", "Escalated blocker", `${blockerId} → ${toRole}`,
        { id: nextId("c"), ts: nowIso(), icon: "⚠", text: `${blockerId} escalated to ${toRole}` });
    });
  }, [log, remote]);

  const resolve = useCallback((blockerId: string) => {
    if (blockerId.startsWith("RT-")) { void deleteFieldEvent(blockerId.slice(3)); return; }
    setS((st) => {
      const b = st.blockers.find((x) => x.id === blockerId);
      if (!b || b.status === "resolved") return st;
      const blockers = st.blockers.map((x) => x.id === blockerId ? { ...x, status: "resolved" as BlockerStatus } : x);
      const assets = st.assets.map((a) => a.asset_id === b.asset_id ? { ...a, current_stage: "On GT", green_date: DEMO_TODAY } : a);
      let next = log({ ...st, blockers, assets }, "Commissioning Lead", "Tag cleared", `${blockerId} signed off — ${b.title}`,
        { id: nextId("c"), ts: nowIso(), icon: "✅", text: `${blockerId} resolved — tag cleared, burn −£${Math.round(b.burn_per_day / 1000)}k/day` });
      if (blockers.filter((x) => x.gate === "C" && x.status !== "resolved").length === 0) {
        next = log(next, "Keldra", "Gate C cleared", "COLO Hall 1 cooling — all tags signed off · Gates D & E unlocked",
          { id: nextId("c"), ts: nowIso(), icon: "🟢", text: "Gate C cleared — D & E unlocked" });
      }
      return next;
    });
  }, [log]);

  const reset = useCallback(() => {
    void clearFieldEvents();
    setRemote([]);
    const fresh = initialScripted();
    fresh.audit = [{ id: nextId("a"), ts: nowIso(), actor: "Demo", action: "Demo reset", detail: "Restored opening scenario · field rows cleared" }, ...openingAudit()];
    setS(fresh);
  }, []);

  const api = useMemo<DemoApi>(() => {
    const redTags = remote.filter((e) => e.kind === "red_tag");
    const openBlockers = [...redTags.map(remoteToBlocker), ...s.blockers.filter((b) => b.status !== "resolved")];
    const burnPerDay = openBlockers.reduce((acc, b) => acc + b.burn_per_day, 0);

    const openC = openBlockers.filter((b) => b.gate === "C");
    const cleared = openC.length === 0;
    const gateC: GateView = { id: "C", tagsDone: Math.max(0, Math.min(GATE_C_TOTAL, GATE_C_TOTAL - openC.length)), tagsTotal: GATE_C_TOTAL, status: cleared ? "cleared" : "blocked", burnPerDay: openC.reduce((acc, b) => acc + b.burn_per_day, 0), openCount: openC.length };

    const tagged = new Set(redTags.map((e) => e.asset_id).filter(Boolean) as string[]);
    const assets = tagged.size === 0 ? s.assets : s.assets.map((a) => tagged.has(a.asset_id) ? { ...a, current_stage: "RT", red_tag_date: DEMO_TODAY } : a);

    const byTs = (a: { ts: string }, b: { ts: string }) => (a.ts < b.ts ? 1 : -1);
    const changes = [...remote.map(remoteToChange), ...s.changes].sort(byTs);
    const audit = [...remote.map(remoteToAudit), ...s.audit].sort(byTs);

    const rootMap = new Map<string, number>();
    for (const b of openBlockers) rootMap.set(b.root, (rootMap.get(b.root) ?? 0) + 1);
    const rootRollup = [...rootMap.entries()].map(([root, count]) => ({ root, count })).sort((a, b) => b.count - a.count);

    return { assets, rawAssets: s.assets, changes, audit, openBlockers, burnPerDay, gateC, gateDE: cleared ? "ready" : "waiting", rootRollup, raiseTag, escalate, resolve, reset };
  }, [s, remote, raiseTag, escalate, resolve, reset]);

  return <DemoCtx.Provider value={api}>{children}</DemoCtx.Provider>;
}

export function useDemo(): DemoApi {
  const ctx = useContext(DemoCtx);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
