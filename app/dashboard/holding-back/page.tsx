"use client";

import Link from "next/link";
import type { WizardData } from "../../onboarding/types";
import HoldingBackView from "../views/holding-back";

// Standalone route for direct linking. The same view also renders inside the
// dashboard shell as the "Holding back" tab (with the live project context).
const FALLBACK: WizardData = {
  phase: null,
  org: { name: "Ardmac", type: "main-contractor", colour: "#8a3dd6" },
  project: {
    name: "DUB-16 Cx",
    client: "Microsoft",
    sector: "Data Centre",
    startDate: "",
    handoverDate: "2026-12-02",
    buildType: null,
    location: "Grangecastle",
  },
  otherOrgs: [],
  template: null,
  uploads: { team: [], assets: [], constraints: [], register: null, xer: null },
  invites: [],
  viewingAs: { orgName: "Ardmac", orgType: "main-contractor", role: "main-contractor" },
};

export default function HoldingBackPage() {
  return (
    <main className="py-8">
      <div className="mx-auto mb-4 max-w-4xl px-8">
        <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
          ← Back to dashboard
        </Link>
      </div>
      <HoldingBackView
        project={FALLBACK}
        viewingAs={FALLBACK.viewingAs}
        blockerMap={null}
        onOpenBlocker={() => {}}
      />
    </main>
  );
}
