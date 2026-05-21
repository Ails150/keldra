"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="w-full max-w-md">
        <h2
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 22, lineHeight: 1.2 }}
        >
          Check your email
        </h2>
        <p
          className="mt-2 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
          style={{ fontSize: 15, lineHeight: 1.5 }}
        >
          We sent a magic link to {email}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        Sign in
      </h2>
      <p
        className="mt-1.5 text-sm text-ink-mid"
        style={{ lineHeight: 1.5 }}
      >
        We&apos;ll email you a magic link. No password.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={loading}
          className="w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors"
          style={{ height: 52, fontSize: 15 }}
        />
        <button
          type="submit"
          disabled={loading || !email}
          className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ height: 52, fontSize: 15 }}
        >
          {loading ? "Sending…" : "Send magic link"}
        </button>
        {error && (
          <p className="text-sm text-red-600 mt-1">{error}</p>
        )}
      </form>
    </div>
  );
}
