"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Settings, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  // "Events", not "Tournaments" — the same list now holds open play nights, and
  // the owner should not have to know they live under a tournaments URL.
  { href: "/admin/tournaments", label: "Events", icon: Trophy },
  { href: "/admin/contacts", label: "People", icon: Users },
  // No Drop-ins item: guests are rows on each event's Roster. The old page
  // fronted a table that has held zero rows ever (B3 deletes it).
  { href: "/admin/site", label: "Settings", icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/admin/logout", { method: "POST" });
      if (!res.ok) {
        toast.error("Logout failed.");
        setLoggingOut(false);
        return;
      }
      window.location.href = "/admin";
    } catch {
      toast.error("Logout failed.");
      setLoggingOut(false);
    }
  };

  return (
    <>
      <nav className="admin-nav" aria-label="Admin navigation">
        <div className="admin-nav-inner">
          <Link
            href="/admin"
            className="flex items-center gap-3 shrink-0"
            aria-label="Houston Premier Soccer admin"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hps-badge.png"
              alt=""
              width="36"
              height="36"
              className="bg-white rounded-full"
            />
            <span className="text-sm font-semibold leading-tight">
              HOUSTON PREMIER
              <span className="block text-[10px] tracking-[.2em] text-zinc-400 mt-1">
                SOCCER / OPERATIONS
              </span>
            </span>
          </Link>
          <div className="admin-nav-links">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-zinc-400">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline hover:text-white"
            >
              Public site ↗
            </Link>
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogout}
              className="min-h-10 hover:text-white"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </nav>

      {children}
    </>
  );
}
