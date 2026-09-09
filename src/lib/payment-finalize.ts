/**
 * Payment finalisation (F-02): from a Stripe Checkout Session to a converged
 * local state, exactly once, with the business facts re-checked server-side.
 *
 * ## What a successful Stripe payment does locally (traced 2026-09-09)
 *
 *   1. one `payments` row keyed by `stripe_session_id`           (ledger)
 *   2. `registrations.payment_status` → 'paid'                    (confirmation)
 *      plus World Cup `team_name` / notes when the metadata carries them
 *   3. `drop_ins.payment_status` → 'paid' for a guest fee
 *   4. (historically) a contact upsert by email
 *
 * There is NO automatic roster insertion: the roster IS the registration row,
 * which exists before checkout. Steps 1–3 are one business transaction and are
 * now performed by the database function `finalize_checkout_payment`
 * (supabase/migrations/20260909120100_stripe_payment_finalization.sql). Step 4
 * stays outside it: it is an external-ish enrichment, not part of settlement.
 *
 * ## Trust model
 *
 * A verified Stripe signature proves the event came from Stripe. It does NOT
 * prove the metadata is right — metadata was written by our own checkout code,
 * but it is stale by definition and could in principle be attached to a session
 * created by a different code path. So metadata only IDENTIFIES candidates
 * (registration id, drop-in id, tournament id); the amount, currency and event
 * association are re-derived from the rows and compared with the verified
 * Stripe object. Only when everything matches does the registration confirm.
 * When it does not, the money is still recorded on `payments` (it moved) and
 * the registration is flagged for review instead of confirmed.
 *
 * ## Settlement semantics
 *
 * HPS uses Checkout Sessions in `mode: 'payment'` (src/lib/stripe-checkout.ts,
 * src/app/api/admin/drop-ins/[id]/pay-link/route.ts). Every production payment
 * row carries a `cs_` session id and a `pi_` payment intent. Only card is
 * explicitly requested on the drop-in path; the registration path leaves the
 * method list to the Stripe dashboard, which MAY include asynchronous methods.
 * `checkout.session.completed` therefore confirms only when the session's own
 * `payment_status` is 'paid'; an 'unpaid' completion is recorded and settles
 * later on `checkout.session.async_payment_succeeded`.
 *
 * Written against a `FinalizeStore` so the whole branch table is testable
 * without Postgres (scripts/test-payment-finalize.ts).
 */
import type Stripe from "stripe";
import { normalizeEmail } from "@/lib/contacts";
import { priceTournamentCheckout, type PricedTournament } from "@/lib/stripe-checkout";
import { parseCheckoutPayKind, parseWorldCupRosterSize } from "@/lib/world-cup-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only currency the pricing model knows. */
export const EXPECTED_CURRENCY = "usd";

/* ------------------------------------------------------------------ */
/* Verified facts pulled off the Stripe object                          */
/* ------------------------------------------------------------------ */

export type CheckoutSessionFacts = {
  sessionId: string;
  paymentIntentId: string | null;
  mode: string | null;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  customerEmail: string | null;
  clientReferenceId: string | null;
  metadata: Record<string, string>;
};

export function checkoutSessionFacts(session: Stripe.Checkout.Session): CheckoutSessionFacts {
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(session.metadata ?? {})) {
    if (typeof v === "string") meta[k] = v;
  }
  return {
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    mode: session.mode ?? null,
    status: session.status ?? null,
    paymentStatus: session.payment_status ?? null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    customerEmail: session.customer_email ?? session.customer_details?.email ?? null,
    clientReferenceId: session.client_reference_id ?? null,
    metadata: meta,
  };
}

/* ------------------------------------------------------------------ */
/* Store contract                                                       */
/* ------------------------------------------------------------------ */

export type FinalizeRegistrationRow = {
  id: string;
  email: string | null;
  tournament_id: string | null;
  contact_id: string | null;
  payment_status: string;
  cancelled_at: string | null;
};

export type FinalizeDropInRow = {
  id: string;
  amount_cents: number;
  tournament_id: string | null;
  contact_id: string | null;
  payment_status: string;
};

export type FinalizeArgs = {
  event_id: string | null;
  event_type: string;
  session_id: string;
  payment_intent_id: string | null;
  email: string;
  amount_cents: number;
  currency: string;
  tournament_id: string | null;
  tournament_name: string | null;
  registration_id: string | null;
  drop_in_id: string | null;
  contact_id: string | null;
  confirm: boolean;
  review_note: string | null;
  team_name: string | null;
  notes_line: string | null;
};

export type FinalizeRpcResult = {
  outcome: "finalized" | "recorded_needs_review" | "duplicate_event";
  payment_id?: string;
  payment_inserted?: boolean;
  registration_updated?: boolean;
  registration_status?: string | null;
  drop_in_updated?: boolean;
  previous_outcome?: string | null;
};

export interface FinalizeStore {
  loadRegistration(id: string): Promise<FinalizeRegistrationRow | null>;
  /** Newest live registration for this email on this event (legacy sessions only). */
  findRegistrationByEmail(email: string, tournamentId: string): Promise<FinalizeRegistrationRow | null>;
  loadTournament(id: string): Promise<PricedTournament | null>;
  loadDropIn(id: string): Promise<FinalizeDropInRow | null>;
  /** Enrichment only; a failure must not block settlement. */
  ensureContactByEmail(email: string): Promise<string | null>;
  /** MUST be one database transaction. Throws on infrastructure failure. */
  finalize(args: FinalizeArgs): Promise<FinalizeRpcResult>;
  /** Bookkeeping for events that carry no settlement. Throws on failure. */
  recordEvent(input: {
    eventId: string;
    type: string;
    objectId: string | null;
    outcome: string;
    detail: string | null;
  }): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Outcome                                                              */
/* ------------------------------------------------------------------ */

export type FinalizeOutcome =
  | {
      status: "finalized";
      paymentId: string | null;
      paymentInserted: boolean;
      registrationId: string | null;
      registrationUpdated: boolean;
      dropInUpdated: boolean;
    }
  | { status: "duplicate_event"; previousOutcome: string | null }
  | { status: "needs_review"; paymentId: string | null; registrationId: string | null; reason: string }
  | { status: "not_paid"; paymentStatus: string | null }
  | { status: "skipped"; reason: "no_email" | "not_payment_mode" }
  | { status: "error"; error: string; retryable: boolean };

export type FinalizeOptions = {
  /** Stripe event id for webhook deliveries; null for the success page / sync / reconciler. */
  eventId: string | null;
  eventType: string;
};

function readMetaUuid(meta: Record<string, string>, key: string): string | null {
  const raw = meta[key];
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

type Validation = { confirm: true } | { confirm: false; reason: string };

/**
 * Compare Stripe's verified amount/currency with what the server-side rows say
 * this payment should have cost. Pure.
 */
export function validateBusinessFacts(input: {
  facts: CheckoutSessionFacts;
  registration: FinalizeRegistrationRow | null;
  tournament: PricedTournament | null;
  dropIn: FinalizeDropInRow | null;
}): Validation {
  const { facts, registration, tournament, dropIn } = input;
  const metaTournamentId = readMetaUuid(facts.metadata, "tournament_id");

  if ((facts.currency ?? "").toLowerCase() !== EXPECTED_CURRENCY) {
    return { confirm: false, reason: `currency_mismatch: got ${facts.currency ?? "none"}, expected ${EXPECTED_CURRENCY}` };
  }
  if (facts.amountTotal == null || facts.amountTotal < 0) {
    return { confirm: false, reason: "amount_missing" };
  }

  let expectedCents: number | null = null;

  if (dropIn) {
    if (metaTournamentId && dropIn.tournament_id && metaTournamentId !== dropIn.tournament_id) {
      return { confirm: false, reason: "event_mismatch: drop-in belongs to a different event" };
    }
    expectedCents = dropIn.amount_cents;
  } else if (registration) {
    if (!registration.tournament_id) {
      return { confirm: false, reason: "registration_has_no_event: cannot price" };
    }
    if (metaTournamentId && metaTournamentId !== registration.tournament_id) {
      return { confirm: false, reason: "event_mismatch: registration is on a different event" };
    }
    if (!tournament || tournament.id !== registration.tournament_id) {
      return { confirm: false, reason: "event_not_found: cannot price" };
    }
    const priced = priceTournamentCheckout(
      tournament,
      parseCheckoutPayKind(facts.metadata.pay_kind),
      parseWorldCupRosterSize(facts.metadata.roster_size),
      facts.metadata.team_name || undefined
    );
    if ("error" in priced) {
      return { confirm: false, reason: `pricing_failed: ${priced.error}` };
    }
    expectedCents = priced.amountCents;
  } else {
    return { confirm: false, reason: "no_local_record: payment recorded unlinked" };
  }

  if (facts.amountTotal !== expectedCents) {
    return {
      confirm: false,
      reason: `amount_mismatch: got ${facts.amountTotal}, expected ${expectedCents}`,
    };
  }

  return { confirm: true };
}

/**
 * Finalise one Checkout Session. Safe to call from the webhook, the success
 * page, the admin sync and the offline reconciler; all converge to the same
 * end state, and repeated calls are no-ops.
 */
export async function finalizeCheckoutSession(
  facts: CheckoutSessionFacts,
  store: FinalizeStore,
  opts: FinalizeOptions
): Promise<FinalizeOutcome> {
  // 1. Settlement semantics: only a PAID session settles anything.
  if (facts.mode && facts.mode !== "payment") {
    return { status: "skipped", reason: "not_payment_mode" };
  }
  if (facts.paymentStatus !== "paid") {
    if (opts.eventId) {
      try {
        await store.recordEvent({
          eventId: opts.eventId,
          type: opts.eventType,
          objectId: facts.sessionId,
          outcome: "not_paid",
          detail: `payment_status=${facts.paymentStatus ?? "none"}`,
        });
      } catch (err) {
        return { status: "error", error: errorMessage(err), retryable: true };
      }
    }
    return { status: "not_paid", paymentStatus: facts.paymentStatus };
  }

  // 2. Identify candidates from metadata (identification only).
  const email = normalizeEmail(facts.metadata.email ?? facts.customerEmail ?? "");
  if (!email) {
    if (opts.eventId) {
      try {
        await store.recordEvent({
          eventId: opts.eventId,
          type: opts.eventType,
          objectId: facts.sessionId,
          outcome: "skipped_no_email",
          detail: null,
        });
      } catch (err) {
        return { status: "error", error: errorMessage(err), retryable: true };
      }
    }
    return { status: "skipped", reason: "no_email" };
  }

  const metaTournamentId = readMetaUuid(facts.metadata, "tournament_id");
  const metaRegistrationId =
    readMetaUuid(facts.metadata, "registration_id") ??
    (facts.clientReferenceId && UUID_RE.test(facts.clientReferenceId)
      ? facts.clientReferenceId.toLowerCase()
      : null);
  const metaDropInId = readMetaUuid(facts.metadata, "drop_in_id");
  const metaContactId = readMetaUuid(facts.metadata, "contact_id");

  try {
    // 3. Re-read authoritative rows.
    let registration: FinalizeRegistrationRow | null = null;
    let dropIn: FinalizeDropInRow | null = null;
    let tournament: PricedTournament | null = null;

    if (metaDropInId) {
      dropIn = await store.loadDropIn(metaDropInId);
    }
    if (!dropIn) {
      if (metaRegistrationId) {
        registration = await store.loadRegistration(metaRegistrationId);
      }
      // Legacy sessions created from the tournament+email path carry no
      // registration id. Resolve by email ONLY within the named event — never
      // across events — and only to identify, never to authorise.
      if (!registration && !metaRegistrationId && metaTournamentId) {
        registration = await store.findRegistrationByEmail(email, metaTournamentId);
      }
      if (registration?.tournament_id) {
        tournament = await store.loadTournament(registration.tournament_id);
      }
    }

    // 4. Validate the money against the rows.
    const validation = validateBusinessFacts({ facts, registration, tournament, dropIn });

    // Enrichment, outside the transaction and never blocking it.
    let contactId: string | null = metaContactId ?? registration?.contact_id ?? dropIn?.contact_id ?? null;
    if (!contactId) {
      try {
        contactId = await store.ensureContactByEmail(email);
      } catch (err) {
        console.warn("[payment-finalize] contact enrichment failed:", errorMessage(err));
      }
    }

    const args: FinalizeArgs = {
      event_id: opts.eventId,
      event_type: opts.eventType,
      session_id: facts.sessionId,
      payment_intent_id: facts.paymentIntentId,
      email,
      amount_cents: facts.amountTotal ?? 0,
      currency: (facts.currency ?? EXPECTED_CURRENCY).toLowerCase(),
      tournament_id: registration?.tournament_id ?? dropIn?.tournament_id ?? metaTournamentId,
      tournament_name: facts.metadata.tournament_name || tournament?.title || null,
      registration_id: registration?.id ?? null,
      drop_in_id: dropIn?.id ?? null,
      contact_id: contactId,
      confirm: validation.confirm,
      review_note: validation.confirm ? null : `Stripe session ${facts.sessionId}: ${validation.reason}`,
      team_name: validation.confirm ? facts.metadata.team_name?.trim() || null : null,
      notes_line:
        validation.confirm && facts.metadata.pay_kind === "team_share" && facts.metadata.roster_size
          ? `World Cup: paid roster share (${facts.metadata.roster_size} players).`
          : null,
    };

    // 5. One transaction.
    const result = await store.finalize(args);

    if (result.outcome === "duplicate_event") {
      return { status: "duplicate_event", previousOutcome: result.previous_outcome ?? null };
    }
    if (result.outcome === "recorded_needs_review") {
      return {
        status: "needs_review",
        paymentId: result.payment_id ?? null,
        registrationId: args.registration_id,
        reason: validation.confirm ? "unknown" : validation.reason,
      };
    }
    return {
      status: "finalized",
      paymentId: result.payment_id ?? null,
      paymentInserted: result.payment_inserted === true,
      registrationId: args.registration_id,
      registrationUpdated: result.registration_updated === true,
      dropInUpdated: result.drop_in_updated === true,
    };
  } catch (err) {
    // Anything thrown by the store is infrastructure: the caller must NOT
    // acknowledge success. Stripe retries a 5xx; the success page shows the
    // honest "we couldn't record this yet" note; the reconciler will find it.
    return { status: "error", error: errorMessage(err), retryable: true };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
