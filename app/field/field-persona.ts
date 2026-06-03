"use client";

// The foreman Field Mode acts as for the demo. The director board is configured
// top-down; Field Mode is the bottom-up data-entry end — and the seeded persona
// is Site Lead (MEP Sub site lead), so his blockers and the chases Commissioning Lead has sent
// him line up with the activity trail the dashboard already shows.

import {
  loadBaseline,
  type BaselineTask,
} from "../dashboard/lib/baseline-seed";
import {
  type Activity,
  listActivityForCompany,
} from "@/lib/activity";

export const FIELD_PERSONA = {
  firstName: "Site Lead",
  fullName: "Site Lead — MEP Sub",
  companySlug: "mep-sub",
  companyName: "MEP Sub",
  role: "Site Lead",
} as const;

// Site Lead as an activity actor — name matches the trail seed so replies he logs
// render consistently alongside the existing entries.
export const PERSONA_ACTOR = {
  name: FIELD_PERSONA.fullName,
  company_slug: FIELD_PERSONA.companySlug,
  role: "Site lead",
};

// The PM on the other end of every chase.
export const PM = { name: "Commissioning Lead", company_slug: "main-contractor" };

// Blockers Site Lead is accountable for — baseline tasks MEP Sub is holding up.
export function personaBlockers(): BaselineTask[] {
  return loadBaseline()
    .tasks.filter(
      (t) => t.status === "blocked" && t.blocking_company === FIELD_PERSONA.companySlug,
    )
    .sort((a, b) => b.cost_per_day - a.cost_per_day);
}

// Every task Site Lead touches — used to populate the "which task?" dropdown.
export function personaTasks(): BaselineTask[] {
  return loadBaseline().tasks.filter(
    (t) =>
      t.blocking_company === FIELD_PERSONA.companySlug ||
      t.responsible_company === FIELD_PERSONA.companySlug,
  );
}

export type Inbox = { regular: Activity[]; formal: Activity | null };

// Chases the PM has sent to MEP Sub, split into the formal escalation (rendered
// as its own urgent card) and the regular run of chases. Already newest-first.
export function inboxMessages(): Inbox {
  const all = listActivityForCompany(FIELD_PERSONA.companySlug).filter(
    (e) =>
      e.direction === "outbound" &&
      e.recipient?.company_slug === FIELD_PERSONA.companySlug,
  );
  const formal = all.find((e) => (e.subject ?? "").toUpperCase().includes("FORMAL")) ?? null;
  const regular = all.filter((e) => e.id !== formal?.id);
  return { regular, formal };
}

// Whole calendar days since an ISO date (date-only, matches the dashboard).
export function daysAgo(iso: string): number {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(iso);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000));
}
