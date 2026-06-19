"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, Trophy } from "lucide-react";
import type { TournamentPrimaryCta } from "@/lib/tournament-public-links";

type Props = {
  show: boolean;
  cta: TournamentPrimaryCta;
};

/**
 * Fixed bottom CTA bar shown only on mobile (md:hidden), so the primary
 * pay/register action stays reachable without scrolling back up. Replaces
 * the long single-column scroll's only previous mobile affordance, which
 * was the sticky aside — sticky positioning doesn't apply below the lg
 * breakpoint, so mobile visitors had no persistent CTA at all.
 */
export function MobileTournamentCtaBar({ show, cta }: Props) {
  if (!show || cta.kind === "none") return null;

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-base/95 backdrop-blur border-t border-border-token px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <Link href={cta.href} className="btn-primary w-full justify-center text-sm">
        {cta.kind === "pay" ? <CreditCard size={14} /> : <Trophy size={14} />}
        {cta.label}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
