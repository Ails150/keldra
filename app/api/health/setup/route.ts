import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/auth/profile";

// Superadmin-only setup health check. Returns green ticks for: required secrets
// present (presence only — never the values), migrations applied (tables +
// functions + storage bucket), and RLS enabled on every new table.
export async function GET() {
  const state = await getSessionState();
  if (state.status !== "ready" || state.profile.role !== "superadmin") {
    return NextResponse.json({ error: "Superadmin only." }, { status: 403 });
  }

  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const tick = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, detail });

  // --- secrets (presence only) ---
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  tick("SUPABASE_SERVICE_ROLE_KEY present", hasService);
  tick("RESEND_API_KEY present", !!process.env.RESEND_API_KEY);
  tick("RESEND_WEBHOOK_SECRET present", !!process.env.RESEND_WEBHOOK_SECRET);
  tick("CRON_SECRET present", !!process.env.CRON_SECRET);
  tick("NEXT_PUBLIC_SUPABASE_URL present", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  tick("NEXT_PUBLIC_SUPABASE_ANON_KEY present", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // --- database (needs the service key + setup_health() from supabase-health.sql) ---
  if (hasService) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("setup_health");
      if (error) {
        tick("setup_health() callable", false, error.message);
      } else {
        const h = (data ?? {}) as {
          tables?: Record<string, boolean>;
          rls?: Record<string, boolean>;
          functions?: Record<string, boolean>;
          storage_bucket?: boolean;
        };
        for (const [t, ok] of Object.entries(h.tables ?? {})) tick(`table ${t}`, ok);
        for (const [t, ok] of Object.entries(h.rls ?? {})) tick(`RLS on ${t}`, ok);
        for (const [f, ok] of Object.entries(h.functions ?? {})) tick(`function ${f}`, ok);
        tick("storage bucket task-email-attachments", !!h.storage_bucket);
      }
    } catch (err) {
      tick("database checks", false, (err as Error).message);
    }
  } else {
    tick("database checks", false, "skipped — service key missing");
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json({
    ok: allOk,
    summary: `${checks.filter((c) => c.ok).length}/${checks.length} checks passed`,
    checks: checks.map((c) => ({ ...c, status: c.ok ? "✅" : "❌" })),
  });
}
