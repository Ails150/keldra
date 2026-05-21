import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../sign-out-button";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-paper-line px-8 py-5">
        <span
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 24, lineHeight: 1 }}
        >
          Keldra
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-mid">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 48, lineHeight: 1.1 }}
        >
          Welcome, {user.email}
        </h1>
        <p
          className="mt-4 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 18, lineHeight: 1.5 }}
        >
          Your Keldra workspace is being set up.
        </p>
      </main>

      <footer className="border-t border-paper-line px-8 py-4 text-center text-sm text-ink-mid">
        Setup in progress · seeding Mercury × Ardmac × Central pilot project
      </footer>
    </div>
  );
}
