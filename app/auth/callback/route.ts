import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

// Establishes a session from an email link's token BEFORE redirecting. Handles
// the PKCE `code` flow (signup confirmation) and the `token_hash` flow
// (confirm/invite/recovery). Anything without a verifiable token here is most
// likely an implicit-hash invite/recovery link — hand it to /reset-password,
// which establishes the session client-side. We never bounce to the sign-in
// page (that was the "asked to enter a password" bug).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;

  const nextParam = url.searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";

  // No server-verifiable token → let the client set-password page handle it
  // (it reads the URL hash that servers never receive).
  if (!code && !tokenHash) {
    return NextResponse.redirect(`${url.origin}/reset-password`);
  }

  const response = NextResponse.redirect(`${url.origin}${safeNext}`);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type ?? "email" });

  if (error) {
    console.error("[auth/callback] token exchange failed:", error.message);
    // Don't dump them on the sign-in form — send to the set-password page,
    // which shows a plain "link expired" message if it can't recover a session.
    return NextResponse.redirect(`${url.origin}/reset-password`);
  }

  return response;
}
