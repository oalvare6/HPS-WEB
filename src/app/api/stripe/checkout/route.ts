import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail, normalizeEmail } from "@/lib/contacts";
import { verifyPayResumeToken } from "@/lib/app-signing";
import {
  createStripeCheckoutSession,
  persistRegistrationCheckoutDetails,
  resolveDropInCheckout,
  resolveTournamentCheckout,
  type ResolvedCheckout,
} from "@/lib/stripe-checkout";
import { parseCheckoutPayKind, parseWorldCupRosterSize } from "@/lib/world-cup-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CheckoutBody = {
  email?: string;
  tournamentId?: string;
  dropInId?: string;
  payKind?: string;
  registrationId?: string;
  payToken?: string;
  rosterSize?: unknown;
  teamName?: string;
};

/**
 * POST /api/stripe/checkout
 *
 * Pricing and session creation live in src/lib/stripe-checkout.ts (shared
 * with the resume flow and with payment finalisation, which re-derives the
 * expected amount from the same function). This route only decides WHICH
 * registration / drop-in / tournament is being paid for and by whom.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const email = normalizeEmail(body.email ?? "");
    const payKind = parseCheckoutPayKind(body.payKind);
    const rosterSize = parseWorldCupRosterSize(body.rosterSize);
    const teamName = typeof body.teamName === "string" ? body.teamName.trim() : undefined;

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (payKind === "captain_paid_ack") {
      return NextResponse.json(
        { error: "Use the captain-paid confirmation button instead of card checkout." },
        { status: 400 }
      );
    }

    let resolved: ResolvedCheckout;
    let resolvedRegistrationId: string | null = null;
    let checkoutEmail = email;

    if (body.registrationId) {
      if (!UUID_RE.test(body.registrationId)) {
        return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
      }
      if (!verifyPayResumeToken(body.registrationId, body.payToken)) {
        return NextResponse.json(
          { error: "Invalid or expired payment link. Start from your registration link." },
          { status: 403 }
        );
      }

      const { data: registration, error: registrationErr } = await supabaseAdmin
        .from("registrations")
        .select("id, email, payment_status, tournament_id, cancelled_at")
        .eq("id", body.registrationId)
        .maybeSingle();

      if (registrationErr || !registration) {
        return NextResponse.json({ error: "Registration not found." }, { status: 404 });
      }
      // A pay-resume token lives 90 days, so one minted before a cancel is
      // still valid. Taking money on it would charge somebody for a spot they
      // gave up — and then block them from cancelling again.
      if (registration.cancelled_at) {
        return NextResponse.json(
          {
            error:
              "You cancelled this spot, so there's nothing to pay. Sign up again if you'd like to come.",
          },
          { status: 409 }
        );
      }
      if (registration.payment_status === "paid") {
        return NextResponse.json({ error: "This registration is already paid." }, { status: 400 });
      }

      const registrationEmail = normalizeEmail(registration.email ?? "");
      if (!registrationEmail) {
        return NextResponse.json(
          { error: "Registration email is missing. Please contact support." },
          { status: 400 }
        );
      }
      if (registrationEmail !== email) {
        return NextResponse.json({ error: "Email does not match this registration." }, { status: 403 });
      }
      if (!registration.tournament_id) {
        return NextResponse.json(
          { error: "Registration is not linked to a tournament yet. Please contact support." },
          { status: 400 }
        );
      }

      const r = await resolveTournamentCheckout(
        registration.tournament_id,
        payKind,
        rosterSize,
        teamName
      );
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
      resolvedRegistrationId = registration.id;
      checkoutEmail = registrationEmail;
    } else if (body.dropInId) {
      const r = await resolveDropInCheckout(body.dropInId);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else if (body.tournamentId) {
      const r = await resolveTournamentCheckout(body.tournamentId, payKind, rosterSize, teamName);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else {
      return NextResponse.json(
        { error: "Provide tournamentId, dropInId, or a valid registrationId + payToken." },
        { status: 400 }
      );
    }

    // Unauthenticated tournament path: link the payment to the newest live
    // registration for this email on THIS event so the ledger can be matched
    // later. Identification only — nothing on that row is written before the
    // money arrives (the World Cup pre-checkout note used to be written here;
    // it is now applied by finalisation, after Stripe confirms the amount).
    if (!resolvedRegistrationId && resolved.tournamentId) {
      const { data: registration } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", checkoutEmail)
        .eq("tournament_id", resolved.tournamentId)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedRegistrationId = registration?.id ?? null;
    } else if (resolvedRegistrationId) {
      // Token-authorised path only: the caller proved they hold this
      // registration's link, so their World Cup team/share choice may be noted.
      await persistRegistrationCheckoutDetails(resolvedRegistrationId, resolved);
    }

    const { contact } = await upsertContactByEmail({
      first_name: "",
      last_name: "",
      email: checkoutEmail,
      tags: ["paying"],
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get("host")}`;

    const cancelParams = new URLSearchParams({ cancelled: "true" });
    if (resolvedRegistrationId && body.payToken && body.registrationId === resolvedRegistrationId) {
      cancelParams.set("registrationId", resolvedRegistrationId);
      cancelParams.set("payToken", body.payToken);
    }
    if (resolved.tournamentId) {
      const { data: tour } = await supabaseAdmin
        .from("tournaments")
        .select("slug")
        .eq("id", resolved.tournamentId)
        .maybeSingle();
      if (tour?.slug) cancelParams.set("tournament", tour.slug);
    }

    const { url } = await createStripeCheckoutSession({
      resolved,
      email: checkoutEmail,
      registrationId: resolvedRegistrationId,
      contactId: contact?.id ?? null,
      baseUrl,
      cancelUrl: `${baseUrl.replace(/\/$/, "")}/pay?${cancelParams.toString()}`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}
