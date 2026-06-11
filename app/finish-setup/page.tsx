import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionState } from "@/lib/auth/profile";
import SignOutButton from "../sign-out-button";

// Guardrail: a confirmed auth user with NO public.users row would otherwise hit
// a dashboard that can't resolve their org. Instead of crashing, we land them
// here. In practice the sign-up routes always create the profile row, so this
// covers edge cases (a user provisioned in the Auth dashboard before the
// trigger/migration, or a half-finished invite).
export default async function FinishSetupPage() {
  const state = await getSessionState();

  // Not signed in → nothing to finish; send to login.
  if (state.status === "anonymous") redirect("/");
  // Already set up → straight to the dashboard.
  if (state.status === "ready") redirect("/dashboard");

  const email = state.status === "needs-setup" || state.status === "unverified" ? state.email : "";

  return (
    <main className="flex flex-1 flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-paper-line px-8 py-5">
        <span
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 24, lineHeight: 1 }}
        >
          Keldra<span style={{ color: "var(--accent)" }}>.</span>
        </span>
        <div className="flex items-center gap-4">
          {email && <span className="text-sm text-ink-mid">{email}</span>}
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex w-full flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 38, lineHeight: 1.1 }}
        >
          Let&apos;s finish setting up
        </h1>
        <p
          className="mt-3 max-w-md text-ink-mid"
          style={{ fontSize: 16, lineHeight: 1.55 }}
        >
          Your account is confirmed, but it isn&apos;t linked to an organisation
          yet. Either start your own workspace, or ask your admin to send you a
          fresh invite link.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-accent-deep"
          >
            Create your organisation →
          </Link>
          <Link
            href="/join"
            className="inline-flex items-center gap-2 rounded-xl border border-paper-line bg-paper-card px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
          >
            I have an invite link
          </Link>
        </div>
        <p className="mt-6 text-xs text-ink-mid">
          Stuck? Contact your Keldra administrator and they can re-invite you.
        </p>
      </div>
    </main>
  );
}
