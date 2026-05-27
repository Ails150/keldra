import Link from "next/link";
import { notFound } from "next/navigation";
import {
  companyName,
  companyColour,
  daysOpen,
  roomByCode,
  taskById,
} from "../../lib/baseline-seed";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ activity_id: string }>;
}) {
  const { activity_id } = await params;
  const task = taskById(decodeURIComponent(activity_id));
  if (!task) notFound();

  const room = roomByCode(task.affects_room);
  const statusLabel =
    task.status === "not_started_should_be"
      ? "Not started — should be running"
      : task.status.charAt(0).toUpperCase() + task.status.slice(1);

  return (
    <main className="mx-auto max-w-2xl px-8 py-10 space-y-6">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>

      <header>
        <p className="font-mono text-sm text-accent-deep">{task.activity_id}</p>
        <h1
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 28, lineHeight: 1.15 }}
        >
          {task.name}
        </h1>
        <p className="mt-1 text-xs text-ink-mid">{task.wbs_path}</p>
      </header>

      {task.blocked_reason && (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
            Why
          </p>
          <p className="mt-1 text-sm text-ink">{task.blocked_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" value={statusLabel} />
        <Field
          label="Cost of delay"
          value={task.cost_per_day > 0 ? `${GBP.format(task.cost_per_day)}/day` : "—"}
          danger={task.cost_per_day > 0}
        />
        <Field label="Planned start" value={fmt(task.planned_start)} />
        <Field label="Planned end" value={fmt(task.planned_end)} />
        <Field
          label="Manpower"
          value={`${task.actual_manpower} of ${task.planned_manpower} planned`}
        />
        <Field label="Days open" value={`${daysOpen(task)}d`} />
      </div>

      <div className="rounded-2xl border border-paper-line bg-paper-card p-5 space-y-3">
        <Row label="Responsible">
          <CompanyChip slug={task.responsible_company} />
        </Row>
        {task.blocking_company && (
          <Row label="Held by">
            <CompanyChip slug={task.blocking_company} />
          </Row>
        )}
        {room && (
          <Row label="Affects room">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-ink"
            >
              {room.code} · {room.name}{" "}
              <span className="text-ink-mid">(target {room.target})</span>
            </Link>
          </Row>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mid">
        {label}
      </p>
      <p className={`mt-1 text-sm font-medium ${danger ? "text-red-700" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-mid">{label}</span>
      {children}
    </div>
  );
}

function CompanyChip({ slug }: { slug: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-paper"
        style={{ backgroundColor: companyColour(slug) }}
      >
        {companyName(slug).slice(0, 2).toUpperCase()}
      </span>
      <span className="text-sm font-medium text-ink">{companyName(slug)}</span>
    </span>
  );
}
