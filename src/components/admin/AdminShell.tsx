"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Trophy,
  Users,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/admin/contacts", label: "Contacts", icon: Users },
  { href: "/admin/drop-ins", label: "Drop-ins", icon: Ticket },
  { href: "/admin/site", label: "Site", icon: Settings },
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
      <nav className="sticky top-0 z-40 border-b border-border-token bg-base/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex items-center gap-1 md:gap-2 h-14 overflow-x-auto">
          <Link
            href="/admin"
            className="flex items-center gap-2 mr-2 md:mr-4 text-white font-semibold tracking-tight"
          >
            <Shield size={16} className="text-brand" />
            <span className="hidden sm:inline">HPS Admin</span>
            <span className="sm:hidden">Admin</span>
          </Link>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-surface-2 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-surface-2/60"
                }`}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            );
          })}

          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-surface-2/60 transition-colors whitespace-nowrap"
            >
              <ExternalLink size={14} />
              View site
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-surface-2/60 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{loggingOut ? "Logging out…" : "Log out"}</span>
            </button>
          </div>
        </div>
      </nav>

      {children}
    </>
  );
}
