import type { Metadata } from "next";
import FieldNav from "./field-nav";

export const metadata: Metadata = {
  title: "Keldra · Field",
};

// Mobile-first shell for the field-worker route: single column, generous bottom
// padding so content clears the sticky nav.
export default function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-28 pt-6">
        {children}
      </main>
      <FieldNav />
    </div>
  );
}
