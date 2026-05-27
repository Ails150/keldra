"use client";

import Link from "next/link";
import PlannedVsActualView from "../views/planned-vs-actual";

// Standalone route for direct linking. The same view also renders inside the
// dashboard shell as the "Planned vs Actual" tab.
export default function PlannedVsActualPage() {
  return (
    <main className="py-8">
      <div className="mx-auto mb-4 max-w-5xl px-8">
        <Link
          href="/dashboard"
          className="text-xs font-medium text-accent hover:text-accent-deep"
        >
          ← Back to dashboard
        </Link>
      </div>
      <PlannedVsActualView />
    </main>
  );
}
