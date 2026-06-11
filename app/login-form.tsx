"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      // Don't leak which half was wrong.
      setError(
        signInError.message === "Invalid login credentials"
          ? "That email and password don't match. Try again."
          : signInError.message,
      );
      return;
    }

    // The @supabase/ssr browser client persists the session to cookies, so a
    // full navigation lands authenticated and the SSR session sticks — the user
    // signs in once and stays signed in.
    window.location.assign("/dashboard");
  }

  async function handleReset() {
    if (!email) {
      setError("Enter your email first, then tap “Forgot password?”.");
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="w-full max-w-md">
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        Sign in
      </h2>
      <p className="mt-1.5 text-sm text-ink-mid" style={{ lineHeight: 1.5 }}>
        Email and password.
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
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          disabled={loading}
          className="w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors"
          style={{ height: 52, fontSize: 15 }}
        />
        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ height: 52, fontSize: 15 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        {resetSent && (
          <p className="text-sm text-ink-mid mt-1">
            If that email has an account, a reset link is on its way.
          </p>
        )}
        <button
          type="button"
          onClick={handleReset}
          className="self-start text-[13px] text-ink-mid hover:text-accent transition-colors"
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
