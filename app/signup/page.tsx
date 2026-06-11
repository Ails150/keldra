import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignupForm from "./signup-form";

// Create a brand-new organisation. Already-signed-in users go to the dashboard.
export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col bg-paper">
      <div
        className="mx-auto flex w-full flex-1 flex-col"
        style={{ maxWidth: 1600, paddingLeft: 60, paddingRight: 60 }}
      >
        <section className="pt-16 pb-8 md:pt-24 md:pb-12">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] font-medium text-ink"
            style={{ fontSize: 28, lineHeight: 1 }}
          >
            Keldra<span style={{ color: "var(--accent)" }}>.</span>
          </Link>
          <h1
            className="mt-8 font-[family-name:var(--font-fraunces)] font-medium text-ink"
            style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.01em" }}
          >
            Create your organisation
          </h1>
          <p
            className="mt-3 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
            style={{ fontSize: 16, lineHeight: 1.55, maxWidth: 520 }}
          >
            Start a fresh, private Keldra workspace. You&apos;ll be the admin and
            can invite your team once you&apos;re in.
          </p>
        </section>

        <section className="flex-1 pb-16">
          <SignupForm />
        </section>
      </div>
    </main>
  );
}
