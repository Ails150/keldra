"use client";

import Link from "next/link";
import { useField } from "../use-field";
import { roleLabel } from "../../dashboard/utils";

export default function FieldProfile() {
  const { project, name } = useField();

  if (project === null) {
    return (
      <p className="pt-10 text-center text-sm text-ink-mid">
        No project set up yet.
      </p>
    );
  }

  const va = project?.viewingAs;

  return (
    <div className="space-y-5">
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 26, lineHeight: 1.1 }}
      >
        Profile
      </h1>

      <div className="rounded-2xl border border-paper-line bg-paper-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-paper">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-base font-semibold text-ink">{name}</p>
            <p className="text-xs text-ink-mid">
              {va?.orgName}
              {va?.role ? ` · ${roleLabel(va.role)}` : ""}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Project" v={project?.project.name || "—"} />
          <Row k="Acting as" v={va?.orgName || "—"} />
        </dl>
      </div>

      <Link
        href="/dashboard"
        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10"
      >
        Open full dashboard
      </Link>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-mid">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}
