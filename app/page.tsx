import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/profile";
import { landingPathForRole } from "@/lib/auth/landing";
import LoginForm from "./login-form";

export default async function Home() {
  const state = await getSessionState();

  // Route signed-in users by role: field users to /field, everyone else to the
  // dashboard. Confirmed-but-unmapped users go finish setup.
  if (state.status === "ready") redirect(landingPathForRole(state.profile.role));
  if (state.status === "needs-setup") redirect("/finish-setup");
  // anonymous / unverified (pre-migration) → show the login form.

  return (
    <main className="flex flex-1 flex-col bg-paper">
      <div
        className="mx-auto flex w-full flex-1 flex-col"
        style={{ maxWidth: 1600, paddingLeft: 60, paddingRight: 60 }}
      >
        <section className="pt-20 pb-12 md:pt-28 md:pb-16">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-deep"
            style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
          >
            The construction accountability layer
          </p>
          <h1
            className="mt-4 font-[family-name:var(--font-fraunces)] font-medium text-ink"
            style={{ fontSize: 80, lineHeight: 0.95, letterSpacing: "-0.02em" }}
          >
            Keldra<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
          <p
            className="mt-6 font-[family-name:var(--font-fraunces)] font-medium text-ink"
            style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: "-0.01em" }}
          >
            See<span style={{ color: "var(--accent)" }}>.</span> Solve
            <span style={{ color: "var(--accent)" }}>.</span> Scale
            <span style={{ color: "var(--accent)" }}>.</span>
          </p>
          <p
            className="mt-5 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 16, lineHeight: 1.55, maxWidth: 560 }}
          >
            Built on 20 years of finding millions in data that nobody else could
            see.
          </p>
        </section>

        <section className="flex-1 pb-16">
          <LoginForm />
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/join"
              className="font-medium text-accent hover:text-accent-deep"
            >
              Have an invite?
            </Link>
            <Link
              href="/signup"
              className="font-medium text-accent hover:text-accent-deep"
            >
              Create your organisation
            </Link>
          </div>
        </section>

        <footer className="border-t border-paper-line py-5">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mid"
            style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
          >
            Built by Scale 8 Digital · CNNCTD Ltd
          </p>
        </footer>
      </div>
    </main>
  );
}
