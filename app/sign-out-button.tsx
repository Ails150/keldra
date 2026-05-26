"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    // Don't let a hung Supabase call trap the user — race it against a 2s
    // fallback, then clear demo state and leave regardless of the outcome.
    try {
      const supabase = createClient();
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // ignore — we clear local state and redirect either way
    }
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("keldra_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // localStorage may be unavailable — fine
    }
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-[10px] border border-[#dbcce8] bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-accent hover:text-paper hover:border-accent disabled:opacity-60"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
