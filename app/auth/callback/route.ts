import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    console.error("[auth/callback] no code in callback URL", url.toString());
    return NextResponse.redirect(
      `${url.origin}/?error=auth&message=${encodeURIComponent("missing_code")}`,
    );
  }

  const response = NextResponse.redirect(`${url.origin}/dashboard`);

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      "[auth/callback] exchangeCodeForSession failed:",
      error.message,
      "status:",
      error.status,
      "name:",
      error.name,
    );
    return NextResponse.redirect(
      `${url.origin}/?error=auth&message=${encodeURIComponent(error.message)}`,
    );
  }

  console.log("[auth/callback] session exchanged, redirecting to /dashboard");
  return response;
}
