"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Belt-and-braces for password recovery: if Supabase fires PASSWORD_RECOVERY
// (e.g. an implicit-flow recovery token in the URL hash), hard-redirect to
// /reset-password before any dashboard render. A recovery session must set a
// new password before it can be used. The primary path is the reset email
// pointing at /auth/callback?next=/reset-password, but this catches the rest.
export default function RecoveryGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && pathname !== "/reset-password") {
        window.location.replace("/reset-password");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [pathname]);

  return null;
}
