import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PayForm, type TournamentPayOption } from "@/components/pay/PayForm";
import { getPayableTournamentBySlug } from "@/lib/tournaments";
import { getCurrentPlayer } from "@/lib/player-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPayResumeToken } from "@/lib/app-signing";
import {
  isWorldCupTournamentSlug,
  WORLD_CUP_TOURNAMENT_SLUG,
} from "@/lib/world-cup-pricing";

export const dynamic = "force-dynamic";

type PaySearchParams = {
  tournament?: string;
  registrationId?: string;
  payToken?: string;
  cancelled?: string;
};

/**
 * Server-side smart-redirect for `/pay?tournament=<slug>`.
 *
 * When the slug resolves to a payments-open tournament AND the visitor is a
 * logged-in player with a pending, waiver-signed registration for that
 * tournament, we mint a fresh pay-resume token and forward them to the
 * existing paid-flow path (`/pay?registrationId=...&payToken=...`) so the
 * email is locked and they're one click from Stripe Checkout.
 *
 * Otherwise we just return the resolved tournament so it can pre-populate the
 * tournament selector in `<PayForm />`. A null return falls back to the
 * default form (no preselect).
 */
async function resolveSmartRedirect(
  slug: string | undefined,
  alreadyOnPaidFlow: boolean
): Promise<TournamentPayOption | null> {
  if (!slug) return null;

  const tournament = await getPayableTournamentBySlug(slug);
  if (!tournament) return null;

  const initialTournament: TournamentPayOption = {
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

  // Guard against redirect loops: if the URL already carries a registrationId
  // (e.g. cancel-back from Stripe, or the second pass after this very redirect)
  // we render the paid-flow form directly and let the client handle it.
  if (alreadyOnPaidFlow) return initialTournament;

  const player = await getCurrentPlayer();
  if (!player) return initialTournament;

  const { data: registration, error } = await supabaseAdmin
    .from("registrations")
    .select("id, payment_status, waiver_signed")
    .eq("contact_id", player.contact.id)
    .eq("tournament_id", tournament.id)
    .eq("payment_status", "pending")
    .eq("waiver_signed", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[pay] smart-redirect registration lookup failed:", error.message);
    return initialTournament;
  }

  if (!registration) return initialTournament;

  const token = createPayResumeToken(registration.id);
  const params = new URLSearchParams({
    registrationId: registration.id,
    payToken: token,
  });
  redirect(`/pay?${params.toString()}`);
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<PaySearchParams>;
}) {
  const sp = await searchParams;
  const alreadyOnPaidFlow = Boolean(sp.registrationId);
  const initialTournament = await resolveSmartRedirect(sp.tournament, alreadyOnPaidFlow);
  const isWorldCupPay =
    isWorldCupTournamentSlug(sp.tournament) ||
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
            ) : (
              "Secure payment via Stripe. You must register and sign the waiver before paying."
            )}
          </p>
        </div>
      </section>

      <section className="bg-surface min-h-[60vh]">
        <Suspense fallback={null}>
          <PayForm
            initialTournamentId={initialTournament?.id ?? null}
            initialTournament={initialTournament}
          />
        </Suspense>
      </section>
    </>
  );
}
