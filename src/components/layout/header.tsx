"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIndicatorCompact } from "@/components/shared/status-indicator";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/facility", label: "Facility" },
  { href: "/events", label: "Schedule" },
  { href: "/contact", label: "Contact" },
];

// Status data - in production this would come from an API/CMS
const statusItems = [
  { label: "Registration Open", status: "open" as const },
  { label: "Fields: Open", status: "open" as const },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/hps-badge.png"
              alt="Houston Premier Soccer"
              width={48}
              height={48}
              className="w-10 h-10 md:w-12 md:h-12 invert"
            />
            <span className="hidden sm:block font-semibold text-white text-lg">
              Houston Premier Soccer
            </span>
          </Link>

          {/* Desktop: Status + Nav */}
          <div className="hidden md:flex items-center gap-8">
            {/* Status Indicators */}
            <StatusIndicatorCompact items={statusItems} />

            {/* Divider */}
            <div className="h-6 w-px bg-zinc-800" />

            {/* Navigation */}
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
              <Link
                href="/register"
                className="bg-white text-zinc-900 px-4 py-2 text-sm font-medium rounded-md hover:bg-zinc-100 transition-colors"
              >
                Register
              </Link>
            </nav>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 -mr-2 text-zinc-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Nav */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-200",
            mobileMenuOpen ? "max-h-[500px] pb-6" : "max-h-0"
          )}
        >
          {/* Mobile Status Indicators */}
          <div className="pt-4 pb-4 border-t border-zinc-800">
            <StatusIndicatorCompact items={statusItems} />
          </div>

          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-base font-medium text-zinc-400 hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/register"
              className="bg-white text-zinc-900 px-4 py-3 text-center font-medium rounded-md hover:bg-zinc-100 transition-colors mt-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Register for Tournament
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
