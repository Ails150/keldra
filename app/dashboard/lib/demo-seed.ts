"use client";

// generic-demo lock. The dashboard reads its data from localStorage, never from
// Supabase (Supabase here is auth-only). To guarantee the demo build can ONLY
// ever show synthetic data — and can never surface a stale real-CSV ingest that
// happens to be cached in the browser — we force-seed the scrubbed sample into
// localStorage on every dashboard load and purge the derived stores so they
// re-derive from the synthetic project. Nothing here touches Supabase.

import Papa from "papaparse";
import type { WizardData, ViewingAs } from "../../onboarding/types";
import { buildRegisterFromConstraintRows } from "../../onboarding/lib/register-parser";
import { parseXer } from "../../onboarding/lib/xer-parser";
import {
  MER_ASSETS_CSV,
  MER_CONSTRAINTS_CSV,
  MER_TEAM_CSV,
} from "../../onboarding/sample-data/dub16";
import { BLD_XER } from "../../onboarding/sample-data/dub12-xer";

// The only org/role the locked demo may view as. No real org is reachable —
// the switcher's options are a hardcoded generic set (see DEMO_ROLE_OPTIONS).
export const DEMO_VIEWING_AS: ViewingAs = {
  orgName: "Main Contractor",
  orgType: "main-contractor",
  role: "main-contractor",
};

const PROJECT_KEY = "keldra_demo_project";
// Derived stores — cleared so they re-build from the synthetic project/seed
// instead of any cached real-ingest data.
const DERIVED_KEYS = ["keldra_baseline", "keldra_activity", "keldra_blocker_state"];

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseCsv(csv: string): any[] {
  return Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  }).data as any[];
}

// Build a fully synthetic WizardData from the scrubbed MER sample (same path the
// onboarding "Load sample" button uses), with no real names/orgs/asset tags.
export async function buildDemoProject(): Promise<WizardData> {
  const team = parseCsv(MER_TEAM_CSV);
  const assets = parseCsv(MER_ASSETS_CSV);
  const constraints = parseCsv(MER_CONSTRAINTS_CSV);
  const register = await buildRegisterFromConstraintRows(
    "mer-constraint-log.csv",
    constraints,
  );
  const xer = await parseXer(new File([BLD_XER], "MER_Cx.xer"));

  return {
    phase: "done",
    org: { name: "Main Contractor", type: "main-contractor", colour: "#dc2626" },
    project: {
      name: "MER Cx",
      client: "Hyperscale Client",
      sector: "Data centre",
      startDate: "",
      handoverDate: "",
      buildType: null,
      location: "Site",
    },
    otherOrgs: [],
    template: "main-contractor-red-tag",
    uploads: { team, assets, constraints, register, xer },
    invites: [],
    viewingAs: DEMO_VIEWING_AS,
  };
}

// Overwrite the project store with synthetic data and purge derived stores.
// Returns the synthetic project so the caller can render it directly. Safe to
// call on every load; deterministic.
export async function seedDemoStore(): Promise<WizardData> {
  const project = await buildDemoProject();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
      for (const k of DERIVED_KEYS) window.localStorage.removeItem(k);
    } catch {
      // localStorage unavailable (private mode) — fine, we still return the
      // synthetic project for this session so nothing real is shown.
    }
  }
  return project;
}
