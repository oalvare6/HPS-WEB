"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, Trophy, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIndicatorCompact } from "@/components/shared/status-indicator";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  WaiverStatusLine,
  type HeaderWaiverStatus,
} from "@/components/layout/WaiverStatusLine";
import type { StatusPill } from "@/lib/site-settings";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/facility", label: "Facility" },
  { href: "/events", label: "Events" },
  { href: "/contact", label: "Contact" },
];

export function HeaderClient({
  statusItems,
  isAuthed,
  displayName,
  waiverStatus,
}: {
  statusItems: StatusPill[];
  isAuthed: boolean;
  displayName: string | null;
  waiverStatus?: HeaderWaiverStatus | null;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobile = () => setMobileMenuOpen(false);
  const safeDisplayName = (displayName ?? "").trim() || "Account";
  const firstName = safeDisplayName.split(/\s+/)[0];

  return (
    <header className="sticky top-0 z-50 bg-base/95 backdrop-blur-md border-b border-border-token/80">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white p-0.5 shadow-md shadow-black/20">
              <Image
                src="/brand/hps-badge.png"
                alt="Houston Premier Soccer"
                width={48}
                height={48}
                className="w-full h-full rounded-full"
              />
            </div>
            <span className="hidden sm:block font-semibold text-white text-lg">
              Houston Premier Soccer
            </span>
          </Link>

          {/* Desktop: Status + Nav */}
          <div className="hidden md:flex items-center gap-8">
            <StatusIndicatorCompact items={statusItems} />

            <div className="h-6 w-px bg-border-token" />

            <nav className="flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}

              {/*
                Signed in, the account menu IS the right-hand control. The
                "Register" button used to render here unconditionally, so a
                player already on a roster was told to register again — right
                next to their own name. Signed out it stays exactly as it was:
                Register is the front door and should be the loudest thing here.
              */}
              {isAuthed ? (
                <AccountMenu
                  displayName={safeDisplayName}
                  waiverStatus={waiverStatus ?? null}
                />
              ) : (
                <>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                    aria-label="Sign in"
                  >
                    <User size={14} />
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="bg-white text-zinc-900 px-4 py-2 text-sm font-medium rounded-md hover:bg-zinc-100 transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Mobile: account chip + menu button */}
          <div className="md:hidden flex items-center gap-1">
            {/*
              The collapsed phone header used to be byte-identical signed in or
              out — every signed-in signal lived behind the hamburger, so signing
              in looked like nothing happened. The chip is the proof it worked:
              your name, a tap from /me, and the same amber waiver dot the
              desktop AccountMenu shows.
            */}
            {isAuthed && (
              <Link
                href="/me"
                aria-label="Your account"
                className="inline-flex items-center gap-1.5 max-w-[9rem] px-2.5 py-1.5 rounded-full border border-border-token bg-surface-2/60 text-sm font-medium text-zinc-200 hover:text-white transition-colors"
              >
                <User size={14} className="text-brand shrink-0" />
                <span className="truncate">{firstName}</span>
                {waiverStatus?.tone === "warn" && (
                  <span
                    aria-label="Waiver needs attention"
                    title="Waiver needs attention"
                    className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"
                  />
                )}
              </Link>
            )}
            <button
              className="p-2 -mr-2 text-zinc-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-200",
            mobileMenuOpen ? "max-h-[640px] pb-6" : "max-h-0"
          )}
        >
          {/* Mobile Status Indicators */}
          <div className="pt-4 pb-4 border-t border-border-token">
            <StatusIndicatorCompact items={statusItems} />
          </div>

          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium text-zinc-400 hover:text-white transition-colors"
                onClick={closeMobile}
              >
                {link.label}
              </Link>
            ))}

            {isAuthed ? (
              <MobileAccountSection
                displayName={safeDisplayName}
                waiverStatus={waiverStatus ?? null}
                onNavigate={closeMobile}
              />
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-base font-medium text-zinc-400 hover:text-white transition-colors"
                  onClick={closeMobile}
                >
                  <User size={16} />
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="bg-white text-zinc-900 px-4 py-3 text-center font-medium rounded-md hover:bg-zinc-100 transition-colors mt-2"
                  onClick={closeMobile}
                >
                  Sign up to play
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

function MobileAccountSection({
  displayName,
  waiverStatus,
  onNavigate,
}: {
  displayName: string;
  waiverStatus: HeaderWaiverStatus | null;
  onNavigate: () => void;
}) {
  return (
    <div className="pt-2 border-t border-border-token mt-2">
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
        Signed in as{" "}
        <span className="text-zinc-300 font-medium">{displayName}</span>
      </p>
      {waiverStatus && <WaiverStatusLine status={waiverStatus} className="mb-3" />}
      <div className="flex flex-col gap-3">
        <Link
          href="/me"
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-base font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <User size={16} />
          Profile
        </Link>
        <Link
          href="/me#registrations"
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-base font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <Trophy size={16} />
          My registrations
        </Link>
        <SignOutButton
          iconSize={16}
          onSubmitted={onNavigate}
          className="w-full inline-flex items-center gap-2 text-base font-medium text-zinc-400 hover:text-white transition-colors disabled:opacity-60"
        />
      </div>
    </div>
  );
}
