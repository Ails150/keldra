"use client";

// Demo-grade live loop. A single in-memory reactive store (React context) that
// every live surface reads from and writes to. Actions cascade across Today,
// Assets, Gates and Audit the moment they fire. NOT persisted — resets on
// reload. This is demo state only; the pilot wires the same actions to Supabase.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { generateAssets, type DemoAsset } from "./lib/demo-assets";

export type BlockerStatus = "open" | "escalated" | "resolved";

export type LiveBlocker = {
  id: string;
  asset_id: string;
  title: string;
  system: string;
  owner_role: string;
  owner_org: string;
  status: BlockerStatus;
  raised_by: string;
  raised_at: string; // ISO
  burn_per_day: number;
  root: string; // terminal root cause
  gate: string; // gate it blocks
};

export type AuditEntry = {
  id: string;
  ts: string; // ISO
  actor: string;
  action: string;
  detail: string;
};

export type Change = { id: string; ts: string; icon: string; text: string };

const DEMO_TODAY = "2026-05-28";
function offset(days: number): string {
  const d = new Date(DEMO_TODAY + "T08:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

// 7 opening blockers — burns sum to £73k/day, 5 of 7 trace to Hyperscale Client.
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

export type DemoState = {
  assets: DemoAsset[];
  blockers: LiveBlocker[];
  audit: AuditEntry[];
  changes: Change[];
};

function initialState(): DemoState {
  return {
    assets: generateAssets(),
    blockers: openingBlockers(),
    audit: openingAudit(),
    changes: openingChanges(),
  };
}

export type GateView = {
  id: string;
  tagsDone: number;
  tagsTotal: number;
  status: "cleared" | "blocked" | "waiting" | "ready";
  burnPerDay: number;
  openCount: number;
};

export type DemoApi = {
  state: DemoState;
  openBlockers: LiveBlocker[];
  burnPerDay: number;
  gateC: GateView;
  gateDE: "waiting" | "ready";
  rootRollup: { root: string; count: number }[];
  // actions
  raiseTag: (assetId: string, note: string) => void;
  escalate: (blockerId: string, toRole: string) => void;
  resolve: (blockerId: string) => void;
  reset: () => void;
};

const DemoCtx = createContext<DemoApi | null>(null);

let seq = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
const nowIso = () => new Date().toISOString();
const GATE_C_TOTAL = 20;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);

  const log = useCallback((s: DemoState, actor: string, action: string, detail: string, change?: Change): DemoState => {
    const audit = [{ id: nextId("a"), ts: nowIso(), actor, action, detail }, ...s.audit];
    const changes = change ? [change, ...s.changes] : s.changes;
    return { ...s, audit, changes };
  }, []);

  const raiseTag = useCallback((assetId: string, note: string) => {
    setState((s) => {
      const asset = s.assets.find((a) => a.asset_id === assetId);
      const burn = 4000;
      const blocker: LiveBlocker = {
        id: nextId("FIELD"), asset_id: assetId, title: note?.trim() || "Red tag raised on site",
        system: asset?.system ?? "Cooling", owner_role: "Unassigned", owner_org: "—",
        status: "open", raised_by: "Field — Site Lead", raised_at: nowIso(), burn_per_day: burn,
        root: "On site (new)", gate: "C",
      };
      const assets = s.assets.map((a) =>
        a.asset_id === assetId
          ? { ...a, current_stage: "RT", burn_per_day: burn, red_tag_date: DEMO_TODAY, notes: "Red tag raised in field" }
          : a,
      );
      const next = { ...s, assets, blockers: [blocker, ...s.blockers] };
      return log(next, "Field — Site Lead", "Raised red tag",
        `${assetId}${note?.trim() ? " — " + note.trim() : ""}`,
        { id: nextId("c"), ts: nowIso(), icon: "🔴", text: `Red tag raised on ${assetId} — burn +£4k/day` });
    });
  }, [log]);

  const escalate = useCallback((blockerId: string, toRole: string) => {
    setState((s) => {
      const b = s.blockers.find((x) => x.id === blockerId);
      if (!b || b.status === "resolved") return s;
      const blockers = s.blockers.map((x) => x.id === blockerId ? { ...x, status: "escalated" as BlockerStatus, owner_role: toRole } : x);
      const next = { ...s, blockers };
      return log(next, "Commissioning Lead", "Escalated blocker", `${blockerId} → ${toRole}`,
        { id: nextId("c"), ts: nowIso(), icon: "⚠", text: `${blockerId} escalated to ${toRole}` });
    });
  }, [log]);

  const resolve = useCallback((blockerId: string) => {
    setState((s) => {
      const b = s.blockers.find((x) => x.id === blockerId);
      if (!b || b.status === "resolved") return s;
      const blockers = s.blockers.map((x) => x.id === blockerId ? { ...x, status: "resolved" as BlockerStatus } : x);
      const assets = s.assets.map((a) => a.asset_id === b.asset_id ? { ...a, current_stage: "On GT", burn_per_day: 0, green_date: DEMO_TODAY } : a);
      let next = { ...s, blockers, assets };
      next = log(next, "Commissioning Lead", "Tag cleared", `${blockerId} signed off — ${b.title}`,
        { id: nextId("c"), ts: nowIso(), icon: "✅", text: `${blockerId} resolved — tag cleared, burn −£${Math.round(b.burn_per_day / 1000)}k/day` });
      const stillOpen = blockers.filter((x) => x.gate === "C" && x.status !== "resolved").length;
      if (stillOpen === 0) {
        next = log(next, "Keldra", "Gate C cleared", "COLO Hall 1 cooling — all tags signed off · Gates D & E unlocked",
          { id: nextId("c"), ts: nowIso(), icon: "🟢", text: `Gate C cleared — D & E unlocked` });
      }
      return next;
    });
  }, [log]);

  const reset = useCallback(() => {
    const fresh = initialState();
    fresh.audit = [{ id: nextId("a"), ts: nowIso(), actor: "Demo", action: "Demo reset", detail: "Restored opening scenario" }, ...openingAudit()];
    setState(fresh);
  }, []);

  const api = useMemo<DemoApi>(() => {
    const openBlockers = state.blockers.filter((b) => b.status !== "resolved");
    const burnPerDay = openBlockers.reduce((s, b) => s + b.burn_per_day, 0);
    const openC = openBlockers.filter((b) => b.gate === "C");
    const tagsDone = Math.max(0, Math.min(GATE_C_TOTAL, GATE_C_TOTAL - openC.length));
    const cleared = openC.length === 0;
    const gateC: GateView = {
      id: "C", tagsDone, tagsTotal: GATE_C_TOTAL,
      status: cleared ? "cleared" : "blocked",
      burnPerDay: openC.reduce((s, b) => s + b.burn_per_day, 0), openCount: openC.length,
    };
    const rootMap = new Map<string, number>();
    for (const b of openBlockers) rootMap.set(b.root, (rootMap.get(b.root) ?? 0) + 1);
    const rootRollup = [...rootMap.entries()].map(([root, count]) => ({ root, count })).sort((a, b) => b.count - a.count);
    return { state, openBlockers, burnPerDay, gateC, gateDE: cleared ? "ready" : "waiting", rootRollup, raiseTag, escalate, resolve, reset };
  }, [state, raiseTag, escalate, resolve, reset]);

  return <DemoCtx.Provider value={api}>{children}</DemoCtx.Provider>;
}

export function useDemo(): DemoApi {
  const ctx = useContext(DemoCtx);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
