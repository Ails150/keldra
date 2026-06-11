"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const INPUT =
  "w-full rounded-[12px] border border-[#dbcce8] bg-white px-4 text-ink placeholder:text-ink-mid/60 outline-none focus:border-accent transition-colors";

export default function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, companyName, email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      needsConfirmation?: boolean;
    };

    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="w-full max-w-md">
        <h2
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 22, lineHeight: 1.2 }}
        >
          Check your email
        </h2>
        <p className="mt-2 text-sm text-ink-mid" style={{ lineHeight: 1.55 }}>
          We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click
          it to activate your account, then sign in — you&apos;ll land in your
          new organisation&apos;s dashboard.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-deep"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          disabled={loading}
          className={INPUT}
          style={{ height: 52, fontSize: 15 }}
        />
        <input
          type="text"
          required
          autoComplete="organization"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name"
          disabled={loading}
          className={INPUT}
          style={{ height: 52, fontSize: 15 }}
        />
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Work email"
          disabled={loading}
          className={INPUT}
          style={{ height: 52, fontSize: 15 }}
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          disabled={loading}
          className={INPUT}
          style={{ height: 52, fontSize: 15 }}
        />
        <button
          type="submit"
          disabled={loading || !fullName || !companyName || !email || !password}
          className="w-full rounded-[12px] bg-ink text-paper font-medium transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ height: 52, fontSize: 15 }}
        >
          {loading ? "Creating…" : "Create organisation"}
        </button>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      </form>

      <p className="mt-5 text-sm text-ink-mid">
        Already have an account?{" "}
        <Link href="/" className="font-medium text-accent hover:text-accent-deep">
          Sign in
        </Link>
      </p>
    </div>
  );
}
