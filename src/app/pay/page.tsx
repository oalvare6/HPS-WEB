import { Suspense } from "react";
import Link from "next/link";
import { PayPageClient } from "@/components/pay/PayPageClient";
import type { TournamentPayOption } from "@/components/pay/PayForm";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { getCurrentPlayer } from "@/lib/player-auth";
import { getPayableTournamentBySlug } from "@/lib/tournaments";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { getSiteSetting } from "@/lib/site-settings";
import {
  isWorldCupTournamentSlug,
  WORLD_CUP_TOURNAMENT_SLUG,
} from "@/lib/world-cup-pricing";
import type { PayEligibilityWaiverType } from "@/lib/pay-eligibility-types";

export const dynamic = "force-dynamic";

type PaySearchParams = {
  tournament?: string;
  registrationId?: string;
  payToken?: string;
  cancelled?: string;
};

function toPayOption(
  tournament: NonNullable<Awaited<ReturnType<typeof getPayableTournamentBySlug>>>
): TournamentPayOption {
  return {
    id: tournament.id,
    title: tournament.title,
    slug: tournament.slug,
    format: tournament.format,
    recurrence: tournament.recurrence,
    time_start: tournament.time_start,
    time_end: tournament.time_end,
    location: tournament.location,
    entry_fee_cents: tournament.entry_fee_cents,
    drop_in_fee_cents: tournament.drop_in_fee_cents,
  };
}

function resolveDefaultWaiverType(
  waiverType: string | null | undefined
): PayEligibilityWaiverType {
  return waiverType === "youth" ? "youth" : "adult";
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<PaySearchParams>;
}) {
  const sp = await searchParams;
  const registrationId = sp.registrationId?.trim() ?? "";
  const payToken = sp.payToken?.trim() ?? "";
  const skipGate =
    Boolean(registrationId) &&
    Boolean(payToken) &&
    verifyPayResumeToken(registrationId, payToken);

  const tournamentSlug = sp.tournament?.trim() || null;
  const requestedTournament = tournamentSlug
    ? await getPayableTournamentBySlug(tournamentSlug)
    : null;

  const [player, whatsappUrl] = await Promise.all([
    getCurrentPlayer(),
    getSiteSetting("footer.whatsapp_url"),
  ]);

  const initialTournament = requestedTournament ? toPayOption(requestedTournament) : null;
  const tournamentMissing = Boolean(tournamentSlug) && !requestedTournament;

  const isWorldCupPay =
    isWorldCupTournamentSlug(tournamentSlug) ||
    isWorldCupTournamentSlug(initialTournament?.slug ?? null);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            {isWorldCupPay ? "World Cup Team Payment" : "Pay for Tournament"}
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            {isWorldCupPay ? (
              <>
                Pay the full $960 team fee, your share of the roster, or confirm your captain
                already paid. You must{" "}
                <Link
                  href={`/register?tournament=${WORLD_CUP_TOURNAMENT_SLUG}`}
                  className="text-white underline underline-offset-2"
                >
                  register and sign the waiver
                </Link>{" "}
                before playing.
              </>
            ) : skipGate ? (
              "Secure payment via Stripe. Your registration is verified — choose your payment option below."
            ) : (
              "Secure payment via Stripe. Verify your email and waiver, then complete payment."
            )}
          </p>
          {!skipGate && (
            <p className="mt-3 text-sm text-zinc-500">
              Questions?{" "}
              <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false} />
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface min-h-[60vh]">
        {tournamentMissing && !skipGate ? (
          <div className="max-w-lg mx-auto px-6 py-16 text-center">
            <h2 className="text-xl font-semibold text-white mb-3">Payments not available</h2>
            <p className="text-sm text-zinc-400 mb-6">
              This event is not accepting payments right now, or the link may be outdated.
            </p>
            <Link href="/events" className="btn-primary inline-flex justify-center px-6">
              View events
            </Link>
          </div>
        ) : (
          <Suspense fallback={null}>
            <PayPageClient
              skipGate={skipGate}
              tournamentSlug={tournamentSlug}
              initialTournament={initialTournament}
              initialTournamentId={initialTournament?.id ?? null}
              whatsappUrl={whatsappUrl}
              playerEmail={player?.email ?? null}
              defaultWaiverType={resolveDefaultWaiverType(player?.contact.waiver_type)}
              tournamentMissing={tournamentMissing}
            />
          </Suspense>
        )}
      </section>
    </>
  );
}
