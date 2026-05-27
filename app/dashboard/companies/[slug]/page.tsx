import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  BASELINE_TASKS,
  SITE_DIARY,
  companyBySlug,
  daysOpen,
  holdingCompany,
  roomByCode,
} from "../../lib/baseline-seed";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = companyBySlug(slug);
  if (!company) notFound();

  const held = BASELINE_TASKS.filter((t) => holdingCompany(t) === slug);
  const owned = BASELINE_TASKS.filter((t) => t.responsible_company === slug);
  const totalPerDay = held.reduce((s, t) => s + t.cost_per_day, 0);
  const deployment = SITE_DIARY.manpower.filter((m) => m.company === slug);

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 space-y-6">
      <Link href="/dashboard" className="text-xs font-medium text-accent hover:text-accent-deep">
        ← Back to dashboard
      </Link>

      <header className="flex items-center gap-3">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-paper"
          style={{ backgroundColor: BRAND[company.colour] }}
        >
          {company.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 30, lineHeight: 1.1 }}
          >
            {company.name}
          </h1>
          <p className="text-xs text-ink-mid">{company.role}</p>
        </div>
      </header>

      {company.punchLine && (
        <p
          className="font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 14 }}
        >
          {company.punchLine}
        </p>
      )}

      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
          Holding up
        </p>
        <p
          className="mt-1 font-[family-name:var(--font-fraunces)] font-semibold text-red-700"
          style={{ fontSize: 40, lineHeight: 1 }}
        >
          {GBP.format(totalPerDay)}/day
        </p>
      </div>

      {/* Card 1 — blockers held */}
      <Card title={`Blockers held (${held.filter((t) => t.cost_per_day > 0).length})`}>
        {held.filter((t) => t.cost_per_day > 0).length === 0 ? (
          <p className="text-sm text-ink-mid">Nothing currently holding others up.</p>
        ) : (
          <ul className="space-y-2">
            {held
              .filter((t) => t.cost_per_day > 0)
              .map((t) => {
                const r = roomByCode(t.affects_room);
                return (
                  <li key={t.activity_id}>
                    <Link
                      href={`/dashboard/tasks/${t.activity_id}`}
                      className="flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-sm transition-colors hover:bg-paper-warm"
                    >
                      <span className="font-mono text-[11px] text-accent-deep">
                        {t.activity_id}
                      </span>
                      <span className="flex-1 truncate text-ink">{t.name}</span>
                      {r && (
                        <span className="rounded-full bg-paper-warm px-2 py-0.5 font-mono text-[10px] text-ink-mid">
                          {r.code}
                        </span>
                      )}
                      <span className="font-mono text-[11px] font-semibold text-red-700">
                        {GBP.format(t.cost_per_day)}/day
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {/* Card 2 — tasks owned */}
      <Card title={`Tasks owned (${owned.length})`}>
        <ul className="space-y-1.5">
          {owned.slice(0, 8).map((t) => (
            <li key={t.activity_id} className="flex items-center gap-3 text-sm">
              <span className="font-mono text-[11px] text-ink-mid">{t.activity_id}</span>
              <span className="flex-1 truncate text-ink">{t.name}</span>
              <StatusPill status={t.status} />
            </li>
          ))}
          {owned.length > 8 && (
            <li className="text-[11px] text-ink-mid">+ {owned.length - 8} more</li>
          )}
        </ul>
      </Card>

      {/* Card 3 — today's deployment */}
      <Card title="Today's deployment">
        {deployment.length === 0 ? (
          <p className="text-sm text-ink-mid">
            No men logged for {company.name} in today&apos;s site diary.
          </p>
        ) : (
          deployment.map((m) => (
            <p key={m.activity} className="text-sm text-ink">
              <span className="font-semibold">{m.men}</span> man
              {m.men === 1 ? "" : "men"} on {m.activity}.
              {held.filter((t) => t.cost_per_day > 0).length > 0 && (
                <span className="text-ink-mid">
                  {" "}
                  Meeting deployment, but holding{" "}
                  {held.filter((t) => t.cost_per_day > 0).length} critical task
                  {held.filter((t) => t.cost_per_day > 0).length === 1 ? "" : "s"}.
                </span>
              )}
            </p>
          ))
        )}
      </Card>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-paper-line bg-paper-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-mid">
        {title}
      </p>
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: "bg-green-100 text-green-800",
    on_track: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-700",
    not_started_should_be: "bg-amber-100 text-amber-800",
  };
  const label =
    status === "not_started_should_be"
      ? "Not started"
      : status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? "bg-paper-warm text-ink-mid"}`}
    >
      {label}
    </span>
  );
}
