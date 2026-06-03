"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PayForm, type TournamentPayOption } from "@/components/pay/PayForm";
import { PayEmailGate } from "@/components/pay/PayEmailGate";
import type { PayEligibilityWaiverType } from "@/lib/pay-eligibility-types";
import { buildPayResumePath } from "@/lib/pay-resume-url";

type PayPageClientProps = {
  skipGate: boolean;
  tournamentSlug: string | null;
  initialTournament: TournamentPayOption | null;
  initialTournamentId: string | null;
  whatsappUrl: string;
  playerEmail: string | null;
  defaultWaiverType: PayEligibilityWaiverType;
  tournamentMissing: boolean;
};

export function PayPageClient({
  skipGate,
  tournamentSlug,
  initialTournament,
  initialTournamentId,
  whatsappUrl,
  playerEmail,
  defaultWaiverType,
  tournamentMissing,
}: PayPageClientProps) {
  const router = useRouter();

  const handleReadyToPay = useCallback(
    (registrationId: string, payToken: string) => {
      router.replace(
        buildPayResumePath({
          registrationId,
          payToken,
          tournamentSlug,
        })
      );
    },
    [router, tournamentSlug]
  );

  if (skipGate) {
    return (
      <PayForm
        initialTournamentId={initialTournamentId}
        initialTournament={initialTournament}
      />
    );
  }

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
      }}
      whatsappUrl={whatsappUrl}
      playerEmail={playerEmail}
      defaultWaiverType={defaultWaiverType}
      onReadyToPay={handleReadyToPay}
    />
  );
}
