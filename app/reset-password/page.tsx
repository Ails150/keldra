"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { landingPathForRole } from "@/lib/auth/landing";

const INPUT =
  "w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors";

type Phase = "checking" | "ready" | "expired";

// Serves BOTH flows from one page: direct invites ("Create your password") and
// forgot-password ("Set a new password"). It establishes a session from the
// email link — whatever form Supabase delivers it in (?code / ?token_hash /
// #access_token) — then takes only a new password + confirm.
export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let done = false;

    async function establish(): Promise<boolean> {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      const hashStr = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hp = new URLSearchParams(hashStr);

      const type = sp.get("type") || hp.get("type") || "";
      if (type === "invite" || type === "signup") setIsInvite(true);

      try {
        // 1. Implicit flow — tokens in the URL hash.
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) return true;
        }
        // 2. token_hash flow (invite / recovery / email confirm).
        const token_hash = sp.get("token_hash") || hp.get("token_hash");
        if (token_hash) {
          const otpType = (type || "invite") as
            | "invite"
            | "recovery"
            | "signup"
            | "email"
            | "magiclink";
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
          if (!error) return true;
          // Fall back across the common types if the declared one didn't match.
          for (const t of ["invite", "recovery", "email", "magiclink"] as const) {
            if (t === otpType) continue;
            const r = await supabase.auth.verifyOtp({ token_hash, type: t });
            if (!r.error) return true;
          }
        }
        // 3. PKCE code flow.
        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) return true;
        }
      } catch {
        /* fall through */
      }
      // 4. A session may already exist (e.g. detectSessionInUrl handled it).
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    }

    establish().then((ok) => {
      if (done) return;
      setPhase(ok ? "ready" : "expired");
    });

    // Late events (e.g. PASSWORD_RECOVERY) → ready.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsInvite(false);
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "USER_UPDATED") {
        done = true;
        setPhase("ready");
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

    // Land in their workspace by role (field → capture, else dashboard).
    let role: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
        role = (data?.role as string | null) ?? null;
      }
    } catch {
      /* default dashboard */
    }
    window.location.assign(landingPathForRole(role));
  }

  const title = isInvite ? "Create your password" : "Set a new password";

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
            {phase === "expired" ? "Link expired" : title}
          </h1>

          {phase === "checking" && (
            <p className="mt-4 text-ink-mid" style={{ fontSize: 16 }}>
              Checking your link…
            </p>
          )}

          {phase === "expired" && (
            <p className="mt-4 text-ink-mid" style={{ fontSize: 16, maxWidth: 520 }}>
              This link has expired or has already been used — ask your admin to
              resend the invite. There&apos;s nothing to fill in here.{" "}
              <Link href="/" className="font-medium text-accent hover:text-accent-deep">
                Back to sign in
              </Link>
            </p>
          )}

          {phase === "ready" && (
            <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-md flex-col gap-3">
              <p className="text-sm text-ink-mid">Choose a password to finish — that&apos;s it.</p>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (8+ characters)"
                disabled={loading}
                className={INPUT}
                style={{ height: 52, fontSize: 15 }}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                disabled={loading}
                className={INPUT}
                style={{ height: 52, fontSize: 15 }}
              />
              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ height: 52, fontSize: 15 }}
              >
                {loading ? "Saving…" : "Create password & continue"}
              </button>
              {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
