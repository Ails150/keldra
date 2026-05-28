import Link from "next/link";

// TEMP: auth guard removed for demo. Re-add before Tuesday.
export default function OnboardingDone() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <section
          className="rounded-3xl p-10 md:p-12 text-center text-paper shadow-[0_20px_60px_-20px_rgba(26,15,43,0.4)]"
          style={{
            background:
              "linear-gradient(160deg, #1a0f2b 0%, #2a1845 55%, #5e25a3 100%)",
          }}
        >
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{ backgroundColor: "rgba(188,106,255,0.18)", color: "#bc6aff" }}
          >
            Setup complete
          </span>
          <h1
            className="mt-5 font-[family-name:var(--font-fraunces)] font-semibold"
            style={{ fontSize: 52, lineHeight: 1.05 }}
          >
            You&apos;ve <span style={{ color: "var(--accent-bright)" }}>SEEN</span>{" "}
            your data
            <span style={{ color: "var(--accent-bright)" }}>.</span>
          </h1>
          <p
            className="mt-3 font-[family-name:var(--font-fraunces)] italic text-paper/85"
            style={{ fontSize: 20, lineHeight: 1.4 }}
          >
            Now Keldra helps you{" "}
            <span className="not-italic font-semibold text-paper">SOLVE</span>
            <span style={{ color: "var(--accent-bright)" }}>.</span>
          </p>
          <p
            className="mx-auto mt-5 max-w-xl text-paper/85"
            style={{ fontSize: 17, lineHeight: 1.55 }}
          >
            Your project is set up.{" "}
            <span className="font-medium text-paper">Ardmac Red Tag</span>{" "}
            template applied to{" "}
            <span className="font-medium text-paper">247 assets</span>.{" "}
            <span className="font-medium text-paper">12 invites</span> sent.
            Dashboard live with{" "}
            <span className="font-medium text-paper">9 constraints</span> — 3
            already flagged because owner is unclear.
          </p>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-medium text-paper transition-colors"
            style={{
              backgroundColor: "var(--accent)",
              fontSize: 15,
            }}
          >
            Open my dashboard →
          </Link>
        </section>

        <section className="mt-10 rounded-2xl border border-paper-line bg-paper-card p-8">
          <h2
            className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
            style={{ fontSize: 22 }}
          >
            What happens next
          </h2>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-paper-line bg-paper-warm/50 p-5">
              <p
                className="font-mono font-semibold uppercase text-accent-deep"
                style={{
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                }}
              >
                See
              </p>
              <p className="mt-3 text-sm font-medium text-ink">
                12 invites sent
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-mid">
                Magic-link emails are on their way to your team. They'll land in
                their inbox within a minute.
              </p>
            </div>

            <div className="rounded-xl border border-paper-line bg-paper-warm/50 p-5">
              <p
                className="font-mono font-semibold uppercase text-accent-deep"
                style={{
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                }}
              >
                Solve
              </p>
              <p className="mt-3 text-sm font-medium text-ink">
                Baseline programme analysed
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-mid">
                Keldra will reconcile your asset register against the programme
                and surface gaps for review.
              </p>
            </div>

            <div className="rounded-xl border border-paper-line bg-paper-warm/50 p-5">
              <p
                className="font-mono font-semibold uppercase text-accent-deep"
                style={{
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                }}
              >
                Scale
              </p>
              <p className="mt-3 text-sm font-medium text-ink">
                First daily digest
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-mid">
                You'll get a morning brief: new blockers, owner-unclear
                constraints, and yesterday's % complete by trade.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
