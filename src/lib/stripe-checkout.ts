/**
 * Checkout pricing and session creation — the ONE place an amount is decided.
 *
 * Extracted from src/app/api/stripe/checkout/route.ts so that:
 *   1. the resume flow (F-01) can start a payment for a session-authorised
 *      registration without duplicating pricing rules, and
 *   2. payment finalisation (F-02) can recompute the EXPECTED amount for a
 *      Stripe session from server-side rows and refuse to confirm a
 *      registration when Stripe's amount disagrees.
 *
 * `priceTournamentCheckout` is pure (no I/O) and is the function both the
 * route and the webhook validation call, so the two can never drift.
 *
 * ## Supabase is the price (Stage 1.4.1)
 *
 * Until 2026-09-10 this file did something that quietly broke rule 2: when an
 * event carried a `stripe_price_id`, the Checkout Session was created with
 * `line_items: [{ price: <that id> }]`, so **Stripe's Price object decided what
 * the customer was charged** while validation kept using `entry_fee_cents`.
 * Nothing kept the two in step, and Community Cup had exactly that shape in
 * production. Edit the fee in the admin without regenerating the Price — or the
 * reverse — and every card payment for the event is charged, recorded, and then
 * refused confirmation.
 *
 * The operator's decision, 2026-09-10: **`tournaments.entry_fee_cents` (and
 * `drop_ins.amount_cents`) are authoritative.** Stripe Price objects do not
 * define HPS pricing. Every session is now created with `price_data` and a
 * server-computed `unit_amount`, so the amount charged is by construction the
 * amount `priceTournamentCheckout` decided — the same function settlement calls.
 *
 * `tournaments.stripe_price_id` and `stripe_product_id` are still written by
 * `syncTournamentStripePricing` for the Stripe dashboard's benefit, but nothing
 * reads them to price anything. They are obsolete for pricing and are listed for
 * schema cleanup in docs/STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md §17.
 *
 * ## What the customer was quoted is remembered
 *
 * Deciding the price correctly is not enough on its own: the owner can edit the
 * fee between the moment a session is created and the moment it is paid.
 * `createStripeCheckoutSession` therefore records the authorised amount in
 * `stripe_checkout_attempts`, and settlement validates against that row when it
 * exists. See supabase/migrations/20260910130000_stripe_checkout_attempts.sql.
 */
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptsPayments } from "@/lib/tournament-state";
import {
  isWorldCupTournamentSlug,
  worldCupShareAmountCents,
  WORLD_CUP_TEAM_FEE_CENTS,
  type CheckoutPayKind,
  type GenericPayKind,
} from "@/lib/world-cup-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The outcome of pricing. There is deliberately no Stripe Price id here: a
 * resolved checkout carries an amount this server computed and nothing that
 * could stand in for it. Removing that field is what makes "one price source"
 * structural rather than a convention someone has to remember.
 */
export type ResolvedCheckout = {
  amountCents: number;
  productName: string;
  productDescription: string;
  tournamentId: string | null;
  tournamentName: string | null;
  dropInId: string | null;
  payKind: CheckoutPayKind;
  rosterSize: number | null;
  teamName: string | null;
};

export type CheckoutError = { error: string; status: number };

/**
 * The tournament columns pricing needs. Everything else is irrelevant here —
 * `stripe_price_id` most of all: it used to be on this type, and its presence
 * is what made it possible to price from Stripe instead of from Supabase.
 */
export type PricedTournament = {
  id: string;
  title: string;
  slug: string;
  entry_fee_cents: number | null;
  drop_in_fee_cents: number | null;
};

const TOURNAMENT_CHECKOUT_SELECT =
  "id, title, slug, entry_fee_cents, drop_in_fee_cents, payments_open, registration_open, is_draft, status, start_date, end_date";

export function mergeNotes(existing: string | null, line: string): string {
  if (!existing?.trim()) return line;
  if (existing.includes(line)) return existing;
  return `${existing.trim()}\n${line}`;
}

function requiresTeamNameForPayKind(payKind: CheckoutPayKind): boolean {
  return payKind === "team_full" || payKind === "team_share";
}

/**
 * Pure pricing. Given a tournament row and the caller's (validated) choices,
 * decide the amount. Does NOT check whether the event is currently selling —
 * callers creating a session must gate on `acceptsPayments` first, while
 * callers validating a completed payment must not (the event may have closed
 * between checkout and webhook).
 */
export function priceTournamentCheckout(
  t: PricedTournament,
  payKindInput: CheckoutPayKind | undefined,
  rosterSizeInput: number | undefined,
  teamNameInput: string | undefined
): ResolvedCheckout | CheckoutError {
  const teamName = teamNameInput?.trim() ?? "";

  if (isWorldCupTournamentSlug(t.slug)) {
    const payKind = payKindInput ?? "entry";

    if (payKind === "captain_paid_ack") {
      return {
        error: "Use the captain-paid confirmation on the pay page instead of card checkout.",
        status: 400,
      };
    }

    if (payKind !== "team_full" && payKind !== "team_share") {
      return {
        error: "Choose Pay full team or Pay my share for World Cup checkout.",
        status: 400,
      };
    }

    if (requiresTeamNameForPayKind(payKind) && !teamName) {
      return { error: "Team name is required for World Cup team payment.", status: 400 };
    }

    if (payKind === "team_full") {
      return {
        amountCents: WORLD_CUP_TEAM_FEE_CENTS,
        productName: `${t.title} — Full team`,
        productDescription: "Houston Premier Soccer — World Cup 7v7 full team fee ($960)",
        tournamentId: t.id,
        tournamentName: t.title,
        dropInId: null,
        payKind: "team_full",
        rosterSize: null,
        teamName: teamName || null,
      };
    }

    const rosterSize = rosterSizeInput;
    if (!rosterSize) {
      return { error: "Roster size (8–12) is required when paying your share.", status: 400 };
    }

    const shareCents = worldCupShareAmountCents(rosterSize);
    if (shareCents <= 0) {
      return { error: "Invalid roster size. Choose 8–12 players.", status: 400 };
    }

    return {
      amountCents: shareCents,
      productName: `${t.title} — Team share (${rosterSize} players)`,
      productDescription: `Houston Premier Soccer — World Cup 7v7 share ($960 ÷ ${rosterSize})`,
      tournamentId: t.id,
      tournamentName: t.title,
      dropInId: null,
      payKind: "team_share",
      rosterSize,
      teamName: teamName || null,
    };
  }

  const requestedKind: GenericPayKind = payKindInput === "drop_in" ? "drop_in" : "entry";
  let kind: GenericPayKind = requestedKind;
  let cents = kind === "drop_in" ? t.drop_in_fee_cents : t.entry_fee_cents;

  // Fall back to whichever fee is actually configured. Open play and similar
  // events are priced via drop-in only (no entry fee), so a registration-resume
  // pay that defaults to "entry" should still charge the preset drop-in amount.
  if (!cents || cents <= 0) {
    if (kind === "entry" && t.drop_in_fee_cents && t.drop_in_fee_cents > 0) {
      kind = "drop_in";
      cents = t.drop_in_fee_cents;
    } else if (kind === "drop_in" && t.entry_fee_cents && t.entry_fee_cents > 0) {
      kind = "entry";
      cents = t.entry_fee_cents;
    }
  }

  if (!cents || cents <= 0) {
    return {
      error:
        requestedKind === "drop_in"
          ? "No drop-in fee is configured for this tournament."
          : "No entry fee is configured for this tournament.",
      status: 400,
    };
  }

  return {
    amountCents: cents,
    productName: kind === "drop_in" ? `${t.title} — Drop-in` : t.title,
    productDescription:
      kind === "drop_in"
        ? "Houston Premier Soccer — Single-night drop-in"
        : "Houston Premier Soccer — Tournament Entry Fee",
    tournamentId: t.id,
    tournamentName: t.title,
    dropInId: null,
    payKind: kind,
    rosterSize: null,
    teamName: null,
  };
}

/** Load the tournament, apply the calendar backstop, then price. */
export async function resolveTournamentCheckout(
  tournamentId: string,
  payKindInput: CheckoutPayKind | undefined,
  rosterSizeInput: number | undefined,
  teamNameInput: string | undefined
): Promise<ResolvedCheckout | CheckoutError> {
  if (!UUID_RE.test(tournamentId)) {
    return { error: "Invalid tournament id.", status: 400 };
  }

  const { data: t, error } = await supabaseAdmin
    .from("tournaments")
    .select(TOURNAMENT_CHECKOUT_SELECT)
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !t) {
    return { error: "Tournament not found.", status: 404 };
  }

  // Calendar-aware: refuses a past event even if `payments_open` was left on.
  if (!acceptsPayments(t)) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  return priceTournamentCheckout(t, payKindInput, rosterSizeInput, teamNameInput);
}

export async function resolveDropInCheckout(
  dropInId: string
): Promise<ResolvedCheckout | CheckoutError> {
  if (!UUID_RE.test(dropInId)) {
    return { error: "Invalid drop-in id.", status: 400 };
  }

  const { data, error } = await supabaseAdmin
    .from("drop_ins")
    .select(
      "id, amount_cents, payment_status, tournament_id, tournaments ( id, title, payments_open, registration_open, is_draft, status, start_date, end_date )"
    )
    .eq("id", dropInId)
    .maybeSingle();

  if (error || !data) {
    return { error: "Drop-in not found.", status: 404 };
  }

  if (data.payment_status === "paid") {
    return { error: "This drop-in has already been paid.", status: 400 };
  }

  if (!data.amount_cents || data.amount_cents <= 0) {
    return { error: "Drop-in has no amount configured.", status: 400 };
  }

  const tour = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;

  if (tour && !acceptsPayments(tour)) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  return {
    amountCents: data.amount_cents,
    productName: tour?.title ? `${tour.title} — Drop-in` : "Drop-in",
    productDescription: "Houston Premier Soccer — Single-night drop-in",
    tournamentId: data.tournament_id ?? null,
    tournamentName: tour?.title ?? null,
    dropInId: data.id,
    payKind: "drop_in",
    rosterSize: null,
    teamName: null,
  };
}

/** World Cup-only: remember the team/share choice on the row before checkout. */
export async function persistRegistrationCheckoutDetails(
  registrationId: string,
  resolved: ResolvedCheckout
): Promise<void> {
  if (!resolved.teamName && resolved.payKind !== "team_share") return;

  const { data: existing } = await supabaseAdmin
    .from("registrations")
    .select("notes")
    .eq("id", registrationId)
    .maybeSingle();

  const update: { team_name?: string; notes?: string } = {};

  if (resolved.teamName) {
    update.team_name = resolved.teamName;
  }

  if (resolved.payKind === "team_share" && resolved.rosterSize) {
    update.notes = mergeNotes(
      existing?.notes ?? null,
      `World Cup: paying roster share (${resolved.rosterSize} players).`
    );
  } else if (resolved.payKind === "team_full") {
    update.notes = mergeNotes(existing?.notes ?? null, "World Cup: paying full team fee ($960).");
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin
    .from("registrations")
    .update(update)
    .eq("id", registrationId);

  if (error) {
    console.error("[checkout] registration pre-checkout update failed:", error.message);
  }
}

export type CreateCheckoutSessionInput = {
  resolved: ResolvedCheckout;
  email: string;
  registrationId: string | null;
  contactId: string | null;
  /** Absolute site origin. */
  baseUrl: string;
  cancelUrl: string;
};

/**
 * Seams for tests only. Production passes nothing and gets the real Stripe
 * client and the real attempt recorder. They exist so the invariant that
 * matters most here — the charged amount is the one this server computed — can
 * be asserted against the exact parameters Stripe receives, rather than assumed.
 */
export type CreateCheckoutSessionDeps = {
  createSession?: (
    params: Stripe.Checkout.SessionCreateParams
  ) => Promise<{ id: string; url: string | null }>;
  recordAttempt?: typeof recordCheckoutAttempt;
};

/**
 * Record what this server authorised for a Checkout Session, so settlement can
 * honour the price the customer was actually quoted rather than the price the
 * event happens to carry when the webhook lands.
 *
 * Best effort on purpose. If this write fails the player must still be able to
 * pay: settlement falls back to re-deriving the amount from the event rows,
 * which is exactly what it did before this table existed. A failure is logged,
 * never raised.
 */
export async function recordCheckoutAttempt(input: {
  sessionId: string;
  amountCents: number;
  currency?: string;
  registrationId?: string | null;
  dropInId?: string | null;
  tournamentId?: string | null;
  payKind?: string | null;
  rosterSize?: number | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("stripe_checkout_attempts").upsert(
      {
        stripe_session_id: input.sessionId,
        amount_cents: input.amountCents,
        currency: (input.currency ?? "usd").toLowerCase(),
        registration_id: input.registrationId ?? null,
        drop_in_id: input.dropInId ?? null,
        tournament_id: input.tournamentId ?? null,
        pay_kind: input.payKind ?? null,
        roster_size: input.rosterSize ?? null,
      },
      { onConflict: "stripe_session_id" }
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(
      "[checkout] could not record the authorised amount for",
      input.sessionId,
      "-",
      err instanceof Error ? err.message : err,
      "- settlement will fall back to re-deriving it from the event."
    );
  }
}

/**
 * Create the Stripe Checkout Session.
 *
 * The amount is ALWAYS `price_data` with a server-computed `unit_amount`. There
 * is no branch that hands Stripe a Price id, because that is what let a Stripe
 * Price object decide the charge while validation used `entry_fee_cents`
 * (Stage 1.4.1). Nothing the browser sends reaches this number: callers pass a
 * `ResolvedCheckout` produced by `priceTournamentCheckout` /
 * `resolveDropInCheckout`, both of which read the amount from Supabase.
 *
 * Metadata is written server-side and is the only thing the webhook later
 * trusts to IDENTIFY the local records — never to price them.
 */
export async function createStripeCheckoutSession(
  input: CreateCheckoutSessionInput,
  deps: CreateCheckoutSessionDeps = {}
): Promise<{ url: string | null; sessionId: string }> {
  const { resolved } = input;
  const origin = input.baseUrl.replace(/\/$/, "");
  const createSession =
    deps.createSession ??
    (async (params: Stripe.Checkout.SessionCreateParams) => {
      const created = await getStripe().checkout.sessions.create(params);
      return { id: created.id, url: created.url };
    });
  const recordAttempt = deps.recordAttempt ?? recordCheckoutAttempt;

  const metadata: Record<string, string> = {
    email: input.email,
    tournament_id: resolved.tournamentId ?? "",
    tournament_name: resolved.tournamentName ?? resolved.productName,
    registration_id: input.registrationId ?? "",
    drop_in_id: resolved.dropInId ?? "",
    contact_id: input.contactId ?? "",
    pay_kind: resolved.payKind,
    team_name: resolved.teamName ?? "",
    roster_size: resolved.rosterSize ? String(resolved.rosterSize) : "",
  };

  const session = await createSession({
    mode: "payment",
    customer_email: input.email,
    // Ties the session to the registration on Stripe's side too, so the
    // Stripe dashboard and the reconciler can find it without metadata.
    client_reference_id: input.registrationId ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: resolved.amountCents,
          product_data: {
            name: resolved.productName,
            description: resolved.productDescription,
          },
        },
      },
    ],
    metadata,
    success_url: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.cancelUrl,
  });

  await recordAttempt({
    sessionId: session.id,
    amountCents: resolved.amountCents,
    currency: "usd",
    registrationId: input.registrationId,
    dropInId: resolved.dropInId,
    tournamentId: resolved.tournamentId,
    payKind: resolved.payKind,
    rosterSize: resolved.rosterSize,
  });

  return { url: session.url, sessionId: session.id };
}
