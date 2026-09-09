import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PayPageClient, type TournamentPayOption } from "@/components/pay/PayPageClient";
import { PayGateResultCard } from "@/components/pay/PayGateResultCard";
import { getCurrentPlayer } from "@/lib/player-auth";
import { getPayableTournamentBySlug } from "@/lib/tournaments";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { getSiteSetting } from "@/lib/site-settings";
import { runPayEligibilityCheck } from "@/lib/pay-eligibility";
import { acceptsRegistrations } from "@/lib/tournament-state";
import type {
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

export const dynamic = "force-dynamic";

type PaySearchParams = {
  tournament?: string;
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

/**
 * `/pay?tournament=<slug>`.
 *
 * There is no token path any more. The 90-day HMAC link that used to skip the
 * gate and render a payment form here was retired in Stage 1.3; a player who
 * holds their registration reaches it either signed in (through `/register`,
 * whose cards pay, declare cash and cancel against session-authorised routes)
 * or through the emailed magic link (`/pay/resume`). Any `registrationId` /
 * `payToken` still in an old URL is simply ignored, so an old link and a bad
 * link look identical.
 */
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<PaySearchParams>;
}) {
  const sp = await searchParams;

  const tournamentSlug = sp.tournament?.trim() || null;
  const requestedTournament = tournamentSlug
    ? await getPayableTournamentBySlug(tournamentSlug)
    : null;

  // One front door. This page can only ask "who are you?", which is the same
  // question `/register` answers better. If sign-ups are open for this event,
  // go straight there.
  if (requestedTournament && acceptsRegistrations(requestedTournament)) {
    redirect(`/register?tournament=${encodeURIComponent(requestedTournament.slug)}`);
  }

  const [player, whatsappUrl] = await Promise.all([
    getCurrentPlayer(),
    getSiteSetting("footer.whatsapp_url"),
  ]);

  const initialTournament = requestedTournament ? toPayOption(requestedTournament) : null;
  const tournamentMissing = Boolean(tournamentSlug) && !requestedTournament;

  const heroTitle = initialTournament ? `Join ${initialTournament.title}` : "Make a payment";

  // Server-side eligibility for logged-in players: skip the client gate
  // entirely. A player who already holds a registration is sent to their
  // status card on `/register`; everyone else sees a static result card.
  let serverResolved: {
    body: PayEligibilitySuccessBody;
    waiverType: PayEligibilityWaiverType;
  } | null = null;

  if (player && requestedTournament && !tournamentMissing) {
    const waiverType = resolveDefaultWaiverType(player.contact.waiver_type);
    const eligibility = await runPayEligibilityCheck({
      email: player.email,
      tournamentId: requestedTournament.id,
      waiverType,
      // The email came from the Supabase session, so the contact IS the caller.
      linkage: "authenticated_contact",
      // Merely rendering this page must not put anybody on a roster. It used
      // to: a signed-in player with a valid waiver had a registration row
      // written for them before they clicked a thing, which is the same fault
      // the confirm gate on `/register` fixes, one screen over.
      allowAutoEnroll: false,
    });

    if (eligibility.ok) {
      const body = eligibility.body;

      // Already on the roster and owing: `/register`'s status card holds the
      // pay, cash and cancel controls, all authorised by the session.
      if (body.status === "ready_to_pay" || body.status === "needs_waiver") {
        redirect(`/register?tournament=${encodeURIComponent(requestedTournament.slug)}`);
      }

      serverResolved = { body, waiverType };
    } else {
      console.error("[pay] server eligibility check failed:", eligibility.error);
      // Fall through to client gate; rare path, mostly defensive.
    }
  }

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            {heroTitle}
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            {sp.cancelled === "true"
              ? "Payment wasn't completed. Your spot is still held — pay when you're ready."
              : "Secure payment via Stripe. Verify your email and waiver, then complete payment."}
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            Questions?{" "}
            <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false} />
          </p>
        </div>
      </section>

      <section className="bg-surface min-h-[60vh]">
        {tournamentMissing ? (
          <div className="max-w-lg mx-auto px-6 py-16 text-center">
            <h2 className="text-xl font-semibold text-white mb-3">Payments not available</h2>
            <p className="text-sm text-zinc-400 mb-6">
              This event is not accepting payments right now, or the link may be outdated.
            </p>
            <Link href="/events" className="btn-primary inline-flex justify-center px-6">
              View events
            </Link>
          </div>
        ) : serverResolved && initialTournament ? (
          <PayGateResultCard
            result={serverResolved.body}
            tournament={{
              id: initialTournament.id,
              title: initialTournament.title,
              slug: initialTournament.slug,
            }}
            whatsappUrl={whatsappUrl}
            waiverType={serverResolved.waiverType}
            isLoggedIn={Boolean(player)}
          />
        ) : (
          <Suspense fallback={null}>
            <PayPageClient
              initialTournament={initialTournament}
              whatsappUrl={whatsappUrl}
              tournamentMissing={tournamentMissing}
            />
          </Suspense>
        )}
      </section>
    </>
  );
}
