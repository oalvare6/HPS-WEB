"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, ShieldCheck, Trophy, User } from "lucide-react";

/**
 * Header account dropdown for signed-in players.
 *
 * Four items: Profile, My registrations, Security, Sign out. Sign-out is
 * a real form POST to `/auth/signout` so the server clears the Supabase
 * session cookies before the response.
 *
 * Keyboard accessibility: Esc closes; Tab moves naturally through the
 * focusable elements. A 4-item menu doesn't need a focus trap and the
 * spec explicitly says not to add one.
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const closeOnNavigate = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <User size={14} />
        <span className="max-w-[10rem] truncate">{displayName}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border-token bg-base shadow-lg shadow-black/40 overflow-hidden"
        >
          <MenuItem
            href="/me"
            icon={<User size={14} />}
            label="Profile"
            onSelect={closeOnNavigate}
          />
          <MenuItem
            href="/me#registrations"
            icon={<Trophy size={14} />}
            label="My registrations"
            onSelect={closeOnNavigate}
          />
          <MenuItem
            href="/me/security"
            icon={<ShieldCheck size={14} />}
            label="Security"
            onSelect={closeOnNavigate}
          />

          <div className="h-px bg-border-token" aria-hidden="true" />

          <form
            action="/auth/signout"
            method="post"
            role="none"
            onSubmit={closeOnNavigate}
          >
            <button
              type="submit"
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-2 hover:text-white transition-colors text-left"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  icon,
  label,
  onSelect,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-2 hover:text-white transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
