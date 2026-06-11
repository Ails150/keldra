"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { landingPathForRole } from "@/lib/auth/landing";

const INPUT =
  "w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = checking, true = recovery/auth session present, false = no session.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // The recovery link lands here with a session already established (via
    // /auth/callback). If PASSWORD_RECOVERY fires late, mark ready too.
    let done = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!done) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        done = true;
        setHasSession(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // Land where this user belongs (field users → /field).
    let role: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = (data?.role as string | null) ?? null;
      }
    } catch {
      /* fall back to dashboard */
    }
    window.location.assign(landingPathForRole(role));
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
            Set a new password
          </h1>

          {hasSession === false ? (
            <p className="mt-4 text-ink-mid" style={{ fontSize: 16, maxWidth: 520 }}>
              This page needs a valid recovery link. Open the most recent{" "}
              <strong>reset password</strong> email and click the link again.{" "}
              <Link href="/" className="font-medium text-accent hover:text-accent-deep">
                Back to sign in
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-md flex-col gap-3">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (8+ characters)"
                disabled={loading || hasSession === null}
                className={INPUT}
                style={{ height: 52, fontSize: 15 }}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                disabled={loading || hasSession === null}
                className={INPUT}
                style={{ height: 52, fontSize: 15 }}
              />
              <button
                type="submit"
                disabled={loading || hasSession === null || !password || !confirm}
                className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ height: 52, fontSize: 15 }}
              >
                {loading ? "Saving…" : "Save new password"}
              </button>
              {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
