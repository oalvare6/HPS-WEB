"use client";

import { useCallback } from "react";
import Link from "next/link";
import { PayEmailGate } from "@/components/pay/PayEmailGate";
import type { TournamentPayOption } from "@/components/pay/PayForm";
import type { PayEligibilityWaiverType } from "@/lib/pay-eligibility-types";
import { buildPayResumePath } from "@/lib/pay-resume-url";

type PayPageClientProps = {
  tournamentSlug: string | null;
  initialTournament: TournamentPayOption | null;
  whatsappUrl: string;
  defaultWaiverType: PayEligibilityWaiverType;
  tournamentMissing: boolean;
};

/**
 * Logged-out pay flow only. Logged-in users are resolved server-side in
 * `pay/page.tsx` and either land directly on `<PayForm/>` (via redirect) or
 * see a server-rendered result card — they never mount this client tree.
 *
 * `onReadyToPay` does a hard navigation (`window.location.assign`) rather
 * than `router.replace` so the next render is a guaranteed-fresh server pass
 * with the token in the URL — no soft-nav remount edge cases.
 */
export function PayPageClient({
  tournamentSlug,
  initialTournament,
  whatsappUrl,
  defaultWaiverType,
  tournamentMissing,
}: PayPageClientProps) {
  const handleReadyToPay = useCallback(
    (registrationId: string, payToken: string) => {
      const target = buildPayResumePath({
        registrationId,
        payToken,
        tournamentSlug,
      });
      window.location.assign(target);
    },
    [tournamentSlug]
  );

  if (tournamentMissing || !initialTournament) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-white mb-3">Choose an event to pay</h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Open the payment page from your event&apos;s page so we can match your registration,
          or pick an event below.
        </p>
        <Link href="/events" className="btn-primary inline-flex justify-center px-6">
          View events
        </Link>
      </div>
    );
  }

  return (
    <PayEmailGate
      tournament={{
        id: initialTournament.id,
        title: initialTournament.title,
        slug: initialTournament.slug,
        recurrence: initialTournament.recurrence,
        time_start: initialTournament.time_start,
        time_end: initialTournament.time_end,
        location: initialTournament.location,
        format: initialTournament.format,
      }}
      whatsappUrl={whatsappUrl}
      defaultWaiverType={defaultWaiverType}
      onReadyToPay={handleReadyToPay}
    />
  );
}
