import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PayPageClient } from "@/components/pay/PayPageClient";
import { PayForm, type TournamentPayOption } from "@/components/pay/PayForm";
import { PayGateResultCard } from "@/components/pay/PayGateResultCard";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { getCurrentPlayer } from "@/lib/player-auth";
import { getPayableTournamentBySlug } from "@/lib/tournaments";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { getSiteSetting } from "@/lib/site-settings";
import {
  isWorldCupTournamentSlug,
  WORLD_CUP_TOURNAMENT_SLUG,
} from "@/lib/world-cup-pricing";
import { runPayEligibilityCheck } from "@/lib/pay-eligibility";
import { acceptsRegistrations } from "@/lib/tournament-state";
import { buildPayResumePath, buildWaiverSignPath } from "@/lib/pay-resume-url";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reconcileWaiverForRegistration } from "@/lib/waiver-reconcile";
import { isSettledStatus, showsCashPending } from "@/lib/payment-method";
import { NeedsWaiverCard } from "@/components/register/SignupStatusCards";
import type {
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

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

/**
 * What we know about the person behind a resume token. Loaded only on the
 * token path — the rest of the page never needs it.
 */
type ResumeSummary = {
  paymentStatus: string;
  paymentMethod: string | null;
  waiverSigned: boolean;
  teamName: string | null;
  tournamentTitle: string | null;
  tournamentSlug: string | null;
  entryFeeCents: number | null;
};

async function loadResumeSummary(
  registrationId: string
): Promise<ResumeSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "payment_status, payment_method, waiver_signed, teams(name), tournaments(title, slug, entry_fee_cents)"
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[pay] resume summary failed:", error.message);
    return null;
  }

  // PostgREST hands an embedded one-to-one back as an object in some versions
  // and a one-element array in others. Handle both rather than betting.
  const one = <T,>(raw: T | T[] | null | undefined): T | null =>
    !raw ? null : Array.isArray(raw) ? (raw[0] ?? null) : raw;

  const row = data as unknown as {
    payment_status: string;
    payment_method: string | null;
    waiver_signed: boolean | null;
    teams?: { name?: string | null } | { name?: string | null }[] | null;
    tournaments?:
      | { title?: string | null; slug?: string | null; entry_fee_cents?: number | null }
      | { title?: string | null; slug?: string | null; entry_fee_cents?: number | null }[]
      | null;
  };

  const event = one(row.tournaments);

  return {
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? null,
    waiverSigned: Boolean(row.waiver_signed),
    teamName: one(row.teams)?.name ?? null,
    tournamentTitle: event?.title ?? null,
    tournamentSlug: event?.slug ?? null,
    entryFeeCents: event?.entry_fee_cents ?? null,
  };
}

function feeLabel(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
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

  /*
    This page is DocuSeal's `completed_redirect_url` — a player lands here in
    the same second they finish signing. The webhook that was supposed to have
    told us by now spent weeks returning 503, and even a healthy webhook can
    lose a race against a redirect. So ask DocuSeal directly before deciding
    what this player still owes us. See lib/waiver-reconcile.ts.
  */
  let resume: ResumeSummary | null = null;
  let resumeSignUrl: string | null = null;
  if (skipGate) {
    const reconciled = await reconcileWaiverForRegistration(registrationId);
    resumeSignUrl = reconciled.signUrl;
    resume = await loadResumeSummary(registrationId);
  }

  const tournamentSlug = sp.tournament?.trim() || null;
  const requestedTournament = tournamentSlug
    ? await getPayableTournamentBySlug(tournamentSlug)
    : null;

  // One front door. Without a resume token this page can only ask "who are
  // you?", which is the same question `/register` answers better — and its old
  // answer for anyone unrecognised was to send them to `/register` anyway, so
  // the visitor did two screens to reach the one that could help. If sign-ups
  // are open for this event, go straight there.
  //
  // Links already texted out that carry `registrationId` + `payToken` skip this
  // entirely and still land on PayForm, which is the whole point of the token.
  if (!skipGate && requestedTournament && acceptsRegistrations(requestedTournament)) {
    redirect(`/register?tournament=${encodeURIComponent(requestedTournament.slug)}`);
  }

  const [player, whatsappUrl] = await Promise.all([
    getCurrentPlayer(),
    getSiteSetting("footer.whatsapp_url"),
  ]);

  const initialTournament = requestedTournament ? toPayOption(requestedTournament) : null;
  const tournamentMissing = Boolean(tournamentSlug) && !requestedTournament;

  const isWorldCupPay =
    isWorldCupTournamentSlug(tournamentSlug) ||
    isWorldCupTournamentSlug(initialTournament?.slug ?? null);

  // A player who still owes us a signature is not on a payment screen, whatever
  // the URL says. Titling this "Pay for …" over a waiver gate is how someone
  // concludes the site is broken and gives up.
  const waiverOutstanding = skipGate && Boolean(resume) && !resume!.waiverSigned;

  const heroTitle = waiverOutstanding
    ? `Almost there — ${resume!.tournamentTitle ?? initialTournament?.title ?? "your signup"}`
    : isWorldCupPay
      ? "World Cup Team Payment"
      : initialTournament
        ? skipGate
          ? `Pay for ${initialTournament.title}`
          : `Join ${initialTournament.title}`
        : "Pay for Tournament";

  // Server-side eligibility for logged-in players: skip the client gate
  // entirely. Either redirect to /pay with a token, or render a static result
  // card. Falls through to the client gate only if eligibility errors.
  let serverResolved: {
    body: PayEligibilitySuccessBody;
    waiverType: PayEligibilityWaiverType;
  } | null = null;

  if (!skipGate && player && requestedTournament && !tournamentMissing) {
    const waiverType = resolveDefaultWaiverType(player.contact.waiver_type);
    const eligibility = await runPayEligibilityCheck({
      email: player.email,
      tournamentId: requestedTournament.id,
      waiverType,
    });

    if (eligibility.ok) {
      const body = eligibility.body;

      // `runPayEligibilityCheck` auto-enrolls a contact that already has a
      // valid waiver (no per-event re-registration), so a valid-waiver player
      // comes back as `ready_to_pay` here. A `needs_registration` result means
      // we could not auto-enroll (e.g. missing emergency contact) and the
      // inline card below routes them to /register to fill the gap.
      if (body.status === "ready_to_pay") {
        redirect(
          buildPayResumePath({
            registrationId: body.registrationId,
            payToken: body.payToken,
            tournamentSlug,
          })
        );
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
            {waiverOutstanding ? (
              "Your spot is held. Sign your waiver and you're done — you can pay now or later."
            ) : isWorldCupPay ? (
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
        ) : skipGate && resume && !resume.waiverSigned ? (
          /*
            Waiver is a hard gate on roster membership, so a signature we cannot
            confirm means we do not take the money either. Production already
            holds two players who paid and never signed — the state this
            prevents. The link resumes their existing DocuSeal submission rather
            than minting a second one.
          */
          <div className="max-w-2xl mx-auto px-6 py-12">
            <NeedsWaiverCard
              tournamentTitle={resume.tournamentTitle ?? "this event"}
              waiverHref={
                resumeSignUrl ??
                buildWaiverSignPath({ registrationId, payToken, tournamentSlug })
              }
              isExternalWaiver={Boolean(resumeSignUrl)}
              recheckHref={buildPayResumePath({
                registrationId,
                payToken,
                tournamentSlug,
              })}
            />
          </div>
        ) : skipGate ? (
          /*
            ⚠ Keep this boundary's subtree to itself — `<Suspense>` wrapping
            `PayForm` and nothing else.

            PayForm calls `useSearchParams()`, so React renders it behind
            Suspense. Rendering anything alongside that boundary — sibling in
            this section, its own <section>, server or client component —
            strands the fallback `<template>` in the DOM and the Pay button
            never appears at all. Reproduced on a clean production build, which
            is why the roster banner and the pay-later exit are passed *into*
            PayForm as `enrolled` rather than composed around it here.
          */
          <Suspense fallback={null}>
            <PayForm
              initialTournamentId={initialTournament?.id ?? null}
              initialTournament={initialTournament}
              enrolled={
                resume
                  ? {
                      tournamentTitle:
                        resume.tournamentTitle ?? initialTournament?.title ?? null,
                      teamName: resume.teamName,
                      isPaid: isSettledStatus(resume.paymentStatus),
                      payingCash: showsCashPending(
                        resume.paymentMethod,
                        resume.paymentStatus
                      ),
                      statusHref: (resume.tournamentSlug ?? tournamentSlug)
                        ? `/register?tournament=${encodeURIComponent(
                            (resume.tournamentSlug ?? tournamentSlug)!
                          )}`
                        : "/me",
                      entryFeeLabel: feeLabel(
                        resume.entryFeeCents ?? initialTournament?.entry_fee_cents ?? null
                      ),
                    }
                  : null
              }
            />
          </Suspense>
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
              tournamentSlug={tournamentSlug}
              initialTournament={initialTournament}
              whatsappUrl={whatsappUrl}
              defaultWaiverType={resolveDefaultWaiverType(player?.contact.waiver_type)}
              tournamentMissing={tournamentMissing}
            />
          </Suspense>
        )}
      </section>

    </>
  );
}
