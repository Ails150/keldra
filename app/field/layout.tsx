import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth/profile";
import FieldNav from "./field-nav";

export const metadata: Metadata = {
  title: "Keldra · Field",
};

// Mobile-first shell for the field-worker route: single column, generous bottom
// padding so content clears the sticky nav.
export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Viewers are dashboard read-only with no field capture. Anonymous/demo
  // visitors and every other role keep full access, so the public ?w= field
  // demo is untouched.
  const state = await getSessionState();
  if (state.status === "ready" && state.profile.role === "viewer") {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-28 pt-6">
        {children}
      </main>
      <FieldNav />
    </div>
  );
}
