"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Landing for "Have an invite?" when the user doesn't have the link open. They
// paste the full invite link (or just the token) and we route them to the real
// /join/[token] page.
export default function JoinLanding() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = value.trim();
    if (!raw) return;
    // Accept a pasted URL (…/join/TOKEN) or a bare token.
    const token = raw.includes("/join/")
      ? raw.split("/join/")[1].split(/[/?#]/)[0]
      : raw.split(/[/?#]/)[0];
    if (!token) {
      setError("That doesn't look like a valid invite link.");
      return;
    }
    router.push(`/join/${encodeURIComponent(token)}`);
  }

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
            style={{ fontSize: 40, lineHeight: 1.05 }}
          >
            Have an invite?
          </h1>
          <p className="mt-3 text-ink-mid" style={{ fontSize: 16, maxWidth: 520 }}>
            Open the invite link from your email, or paste it below.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-md flex-col gap-3">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://app.keldra.io/join/…"
              className="w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors"
              style={{ height: 52, fontSize: 15 }}
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ height: 52, fontSize: 15 }}
            >
              Continue
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>

          <p className="mt-5 text-sm text-ink-mid">
            No invite?{" "}
            <Link href="/signup" className="font-medium text-accent hover:text-accent-deep">
              Create your organisation
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
