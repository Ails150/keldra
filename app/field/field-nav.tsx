"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/field", label: "Home", icon: "⌂" },
  { href: "/field/capture", label: "Capture", icon: "◎" },
  { href: "/field/blockers", label: "Blockers", icon: "⚑" },
  { href: "/field/profile", label: "Profile", icon: "☻" },
];

export default function FieldNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-line bg-paper-card">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITEMS.map((it) => {
          const active = pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent-deep" : "text-ink-mid"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {it.icon}
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
