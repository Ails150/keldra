"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { inboxMessages } from "./field-persona";

const ITEMS = [
  { href: "/field", label: "Home", icon: "⌂" },
  { href: "/field/blockers", label: "Blockers", icon: "⚑" },
  { href: "/field/inbox", label: "Inbox", icon: "✉" },
  { href: "/field/log", label: "Log", icon: "+" },
];

export default function FieldNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const { regular } = inboxMessages();
    setUnread(Math.min(2, regular.length));
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-line bg-paper-card">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {ITEMS.map((it) => {
          const active = pathname === it.href;
          const showBadge = it.href === "/field/inbox" && unread > 0;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent-deep" : "text-ink-mid"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {it.icon}
              </span>
              {it.label}
              {showBadge && (
                <span className="absolute right-[22%] top-2 h-2 w-2 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
