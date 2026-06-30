"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";

const links = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/ledger", label: "Ledger", icon: "📒" },
  { href: "/games/new", label: "Record", icon: "➕" },
  { href: "/members", label: "Players", icon: "👥" },
  { href: "/profile", label: "Profile", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {links.map((l) => {
          const active =
            pathname === l.href ||
            (l.href !== "/dashboard" && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs",
                active ? "text-accent" : "text-muted",
              )}
            >
              <span className="text-lg leading-none">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
