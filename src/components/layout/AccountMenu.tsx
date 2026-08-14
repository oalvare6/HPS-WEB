"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Trophy, User } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  WaiverStatusLine,
  type HeaderWaiverStatus,
} from "@/components/layout/WaiverStatusLine";

/**
 * Header account dropdown for signed-in players.
 *
 * Opens with the player's waiver standing — "Waiver good through Jun 3, 2027"
 * or "Waiver needed" — because that is the one fact a player wants from the
 * header and the only thing standing between them and playing. Then Profile,
 * My registrations, and Sign out.
 *
 * Sign-out is a real form POST to `/auth/signout` (see `SignOutButton`) so the
 * server clears the httpOnly Supabase session cookies before the response.
 *
 * Keyboard accessibility: Esc closes; Tab moves naturally through the
 * focusable elements. A short menu doesn't need a focus trap and the
 * spec explicitly says not to add one.
 */
export function AccountMenu({
  displayName,
  waiverStatus,
}: {
  displayName: string;
  waiverStatus: HeaderWaiverStatus | null;
}) {
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
        {/*
          A dot rather than the full sentence: the header has no room for a date,
          but "something needs your attention" has to be visible without opening
          the menu, or the waiver line inside it never gets read.
        */}
        {waiverStatus?.tone === "warn" && (
          <span
            aria-label="Waiver needs attention"
            title="Waiver needs attention"
            className="w-1.5 h-1.5 rounded-full bg-yellow-400"
          />
        )}
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
          className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border-token bg-base shadow-lg shadow-black/40 overflow-hidden"
        >
          {waiverStatus && (
            <>
              <div className="px-3 py-2.5" role="none">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {displayName}
                </p>
                <WaiverStatusLine status={waiverStatus} className="mt-1" />
              </div>
              <div className="h-px bg-border-token" aria-hidden="true" />
            </>
          )}

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
          <div className="h-px bg-border-token" aria-hidden="true" />

          <SignOutButton
            inMenu
            onSubmitted={closeOnNavigate}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-2 hover:text-white transition-colors text-left disabled:opacity-60"
          />
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
