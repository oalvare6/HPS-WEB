/**
 * Supabase is the price (Stage 1.4.1).
 *
 *   npx tsx scripts/test-checkout-pricing.ts
 *
 * Stage 1.4 found that checkout BILLED through the Stripe Price object when an
 * event had a `stripe_price_id`, while settlement VALIDATED against
 * `tournaments.entry_fee_cents`. Nothing kept the two in step, so a drifted
 * Price meant a customer could be charged successfully and then refused
 * confirmation. The operator's decision: `entry_fee_cents` and
 * `drop_ins.amount_cents` are authoritative and Stripe Price objects do not
 * define HPS pricing.
 *
 * This file holds that decision in place. It asserts against the exact
 * parameters handed to Stripe — not against a description of them — that:
 *
 *   * the charged amount is the one `priceTournamentCheckout` computed;
 *   * no Price id can reach `line_items`;
 *   * nothing a browser sends can move the number;
 *   * checkout and settlement agree, because they call the same function;
 *   * what was authorised is recorded, so a later fee edit cannot invalidate a
 *     session the customer was already quoted.
 *
 * No network and no database: Stripe and the attempt recorder are injected.
 */
import type Stripe from "stripe";
import {
  createStripeCheckoutSession,
  priceTournamentCheckout,
  recordCheckoutAttempt,
  type PricedTournament,
  type ResolvedCheckout,
} from "../src/lib/stripe-checkout";
import {
  validateBusinessFacts,
  settlementNotesLine,
  type CheckoutAttemptRow,
  type CheckoutSessionFacts,
  type FinalizeRegistrationRow,
} from "../src/lib/payment-finalize";
import { parseCheckoutPayKind, parseWorldCupRosterSize } from "../src/lib/world-cup-pricing";
import { Harness } from "./_test-fakes";

const t = new Harness();

const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743";
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c";

const COMMUNITY_CUP: PricedTournament = {
  id: EVENT_ID,
  title: "Community Cup - Fall 2026",
  slug: "community-cup-fall-2026",
  entry_fee_cents: 8000,
  drop_in_fee_cents: 0,
};

const OPEN_PLAY: PricedTournament = {
  id: "6cc03ca6-84f5-4f36-a4ed-ce8dbfcde854",
  title: "Friday Open Play",
  slug: "friday-open-play",
  entry_fee_cents: null,
  drop_in_fee_cents: 1500,
};

const WORLD_CUP: PricedTournament = {
  id: "7dd14db7-95a6-4a47-b5fe-df9ecfdef965",
  title: "World Cup 7v7",
  slug: "world-cup-summer-tournament",
  entry_fee_cents: null,
  drop_in_fee_cents: 0,
};

function priced(t0: PricedTournament, payKind?: string, rosterSize?: unknown, teamName?: string) {
  return priceTournamentCheckout(
    t0,
    parseCheckoutPayKind(payKind),
    parseWorldCupRosterSize(rosterSize),
    teamName
  );
}

function mustPrice(t0: PricedTournament, payKind?: string, rosterSize?: unknown, teamName?: string): ResolvedCheckout {
  const r = priced(t0, payKind, rosterSize, teamName);
  if ("error" in r) throw new Error(`expected a price, got: ${r.error}`);
  return r;
}

type SessionParams = Stripe.Checkout.SessionCreateParams;
type RecordedAttempt = Parameters<typeof recordCheckoutAttempt>[0];
type LineItem = Stripe.Checkout.SessionCreateParams.LineItem;

/** Captures exactly what would have gone to Stripe. */
function capture() {
  const calls: SessionParams[] = [];
  const attempts: RecordedAttempt[] = [];
  return {
    calls,
    attempts,
    deps: {
      createSession: async (params: SessionParams) => {
        calls.push(params);
        return { id: "cs_captured", url: "https://checkout.stripe.test/cs_captured" };
      },
      recordAttempt: async (a: RecordedAttempt) => {
        attempts.push(a);
      },
    },
  };
}

const lineItems = (params: SessionParams): LineItem[] => params.line_items ?? [];

function facts(overrides: Partial<CheckoutSessionFacts> = {}): CheckoutSessionFacts {
  return {
    sessionId: "cs_x",
    paymentIntentId: "pi_x",
    mode: "payment",
    status: "complete",
    paymentStatus: "paid",
    amountTotal: 8000,
    currency: "usd",
    customerEmail: "player@example.com",
    clientReferenceId: REG_ID,
    metadata: { email: "player@example.com", tournament_id: EVENT_ID, registration_id: REG_ID, pay_kind: "entry" },
    ...overrides,
  };
}

const REGISTRATION: FinalizeRegistrationRow = {
  id: REG_ID,
  email: "player@example.com",
  tournament_id: EVENT_ID,
  contact_id: null,
  payment_status: "pending",
  cancelled_at: null,
};

async function main() {
  /* ---------------------------------------------------------------- */
  /* 1. The amount comes from the event row, and only from there        */
  /* ---------------------------------------------------------------- */
  {
    t.eq("an entry fee is the event's entry_fee_cents", mustPrice(COMMUNITY_CUP).amountCents, 8000);
    t.eq(
      "changing entry_fee_cents changes what a new checkout charges",
      mustPrice({ ...COMMUNITY_CUP, entry_fee_cents: 9000 }).amountCents,
      9000
    );
    t.eq("an open-play event falls back to its drop-in fee", mustPrice(OPEN_PLAY).amountCents, 1500);
    t.eq("an explicit drop-in uses the drop-in fee", mustPrice(OPEN_PLAY, "drop_in").amountCents, 1500);

    const unpriced = priced({ ...COMMUNITY_CUP, entry_fee_cents: null, drop_in_fee_cents: 0 });
    t.check(
      "an event with no fee configured refuses rather than charging zero",
      "error" in unpriced,
      JSON.stringify(unpriced)
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. A resolved checkout carries no second price source              */
  /* ---------------------------------------------------------------- */
  {
    const resolved = mustPrice(COMMUNITY_CUP) as unknown as Record<string, unknown>;
    t.check(
      "ResolvedCheckout has no Stripe Price id field at all",
      !("stripePriceId" in resolved) && !("stripe_price_id" in resolved) && !("priceId" in resolved),
      Object.keys(resolved).join(", ")
    );

    // A tournament row still carrying the column cannot smuggle it through:
    // pricing reads entry_fee_cents and nothing else.
    const withStalePrice = { ...COMMUNITY_CUP, stripe_price_id: "price_stale_9999" } as PricedTournament;
    t.eq(
      "a stale stripe_price_id on the row does not change the amount",
      mustPrice(withStalePrice).amountCents,
      8000
    );
  }

  /* ---------------------------------------------------------------- */
  /* 3. What Stripe is actually asked to charge                         */
  /* ---------------------------------------------------------------- */
  {
    const cap = capture();
    const resolved = mustPrice(COMMUNITY_CUP);
    await createStripeCheckoutSession(
      {
        resolved,
        email: "player@example.com",
        registrationId: REG_ID,
        contactId: null,
        baseUrl: "https://www.houstonpremiersoccer.com",
        cancelUrl: "https://www.houstonpremiersoccer.com/pay?cancelled=true",
      },
      cap.deps
    );

    t.eq("exactly one Checkout Session was created", cap.calls.length, 1);
    const params = cap.calls[0];
    const items = lineItems(params);

    t.eq("one line item", items.length, 1);
    t.check("it is priced inline, not by a Stripe Price id", items[0].price === undefined, JSON.stringify(items[0]));
    t.eq("the unit amount is the amount this server computed", items[0].price_data?.unit_amount, resolved.amountCents);
    t.eq("...which is the event's entry_fee_cents", items[0].price_data?.unit_amount, 8000);
    t.eq("the currency is usd", items[0].price_data?.currency, "usd");
    t.eq("quantity is one", items[0].quantity, 1);
    t.eq("mode is payment", params.mode, "payment");

    const metadata = params.metadata as Record<string, string>;
    t.check(
      "no amount is written into metadata, where it could later be mistaken for authority",
      !Object.keys(metadata).some((k) => /amount|price|cents|unit/i.test(k)),
      Object.keys(metadata).join(", ")
    );
  }

  /* ---------------------------------------------------------------- */
  /* 4. The browser cannot move the number                              */
  /* ---------------------------------------------------------------- */
  {
    // `priceTournamentCheckout` takes no amount at all — the only client-shaped
    // inputs it accepts are a pay kind, a roster size and a team name, each
    // parsed and bounded server-side. Junk of the shape an attacker would try
    // simply does not reach a price.
    t.eq("an unknown pay_kind falls back to the event's entry fee", mustPrice(COMMUNITY_CUP, "free").amountCents, 8000);
    t.eq(
      "a pay_kind of 'amount' is not a pay kind",
      parseCheckoutPayKind("amount"),
      undefined
    );

    for (const bogus of [7, 13, 0, -1, 999, "12; drop table", "8.5", null, {}, [], "1e3"]) {
      t.eq(`roster size ${JSON.stringify(bogus)} is refused`, parseWorldCupRosterSize(bogus), undefined);
    }
    for (const good of [8, 9, 10, 11, 12]) {
      const share = mustPrice(WORLD_CUP, "team_share", good, "3rd Ward FC");
      t.eq(`a roster of ${good} is priced server-side at 96000/${good}`, share.amountCents, Math.round(96_000 / good));
    }
    t.eq("the full team fee is a constant, not an input", mustPrice(WORLD_CUP, "team_full", undefined, "3rd Ward FC").amountCents, 96_000);

    // And the session creation path has no parameter that could carry one.
    const cap = capture();
    const resolved = mustPrice(COMMUNITY_CUP);
    await createStripeCheckoutSession(
      {
        // Deliberately smuggling amount-shaped keys onto the input object.
        ...({ amount: 1, amountCents: 1, unit_amount: 1, price: "price_evil" } as unknown as object),
        resolved,
        email: "player@example.com",
        registrationId: REG_ID,
        contactId: null,
        baseUrl: "https://www.houstonpremiersoccer.com",
        cancelUrl: "https://www.houstonpremiersoccer.com/pay",
      },
      cap.deps
    );
    const items = lineItems(cap.calls[0]);
    t.eq("amount-shaped extras on the input are ignored", items[0].price_data?.unit_amount, 8000);
    t.check("and no price id appears", items[0].price === undefined);
  }

  /* ---------------------------------------------------------------- */
  /* 5. What was authorised is recorded                                 */
  /* ---------------------------------------------------------------- */
  {
    const cap = capture();
    const resolved = mustPrice(WORLD_CUP, "team_share", 10, "3rd Ward FC");
    await createStripeCheckoutSession(
      {
        resolved,
        email: "player@example.com",
        registrationId: REG_ID,
        contactId: null,
        baseUrl: "https://www.houstonpremiersoccer.com",
        cancelUrl: "https://www.houstonpremiersoccer.com/pay",
      },
      cap.deps
    );
    t.eq("one authorisation was recorded", cap.attempts.length, 1);
    const attempt = cap.attempts[0];
    t.eq("it records the session Stripe returned", attempt.sessionId, "cs_captured");
    t.eq("and the amount that was charged, not the event's list price", attempt.amountCents, 9600);
    t.eq(
      "the authorised amount and the charged amount are the same number",
      attempt.amountCents,
      lineItems(cap.calls[0])[0].price_data?.unit_amount
    );
    t.eq("it remembers the registration", attempt.registrationId, REG_ID);
    t.eq("and the share size, so the figure can be explained later", attempt.rosterSize, 10);
  }

  /* ---------------------------------------------------------------- */
  /* 6. Checkout and settlement agree, because they share the function  */
  /* ---------------------------------------------------------------- */
  {
    const cases: [string, PricedTournament, string | undefined, number | undefined][] = [
      ["a plain entry fee", COMMUNITY_CUP, "entry", undefined],
      ["an open-play drop-in", OPEN_PLAY, "drop_in", undefined],
      ["a World Cup full team", WORLD_CUP, "team_full", undefined],
      ["a World Cup share of 12", WORLD_CUP, "team_share", 12],
    ];
    for (const [name, tour, payKind, rosterSize] of cases) {
      const charged = mustPrice(tour, payKind, rosterSize, "3rd Ward FC").amountCents;
      const settled = validateBusinessFacts({
        facts: facts({
          amountTotal: charged,
          metadata: {
            email: "player@example.com",
            tournament_id: tour.id,
            registration_id: REG_ID,
            pay_kind: payKind ?? "entry",
            roster_size: rosterSize ? String(rosterSize) : "",
            team_name: "3rd Ward FC",
          },
        }),
        registration: { ...REGISTRATION, tournament_id: tour.id },
        tournament: tour,
        dropIn: null,
      });
      t.check(`${name}: settlement accepts exactly what checkout charged`, settled.confirm, JSON.stringify(settled));
    }

    // One cent either way is refused, in both directions.
    for (const delta of [-1, 1]) {
      const v = validateBusinessFacts({
        facts: facts({ amountTotal: 8000 + delta }),
        registration: REGISTRATION,
        tournament: COMMUNITY_CUP,
        dropIn: null,
      });
      t.check(`${delta > 0 ? "over" : "under"}paying by a cent is refused`, !v.confirm);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 7. An authorisation beats today's price — but only its own         */
  /* ---------------------------------------------------------------- */
  {
    const attempt: CheckoutAttemptRow = {
      stripe_session_id: "cs_x",
      amount_cents: 8000,
      currency: "usd",
      registration_id: REG_ID,
      drop_in_id: null,
      tournament_id: EVENT_ID,
    };
    const raisedEvent = { ...COMMUNITY_CUP, entry_fee_cents: 9000 };

    const ok = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: raisedEvent,
      dropIn: null,
      attempt,
    });
    t.check("a session settles at the price it was authorised for", ok.confirm, JSON.stringify(ok));
    if (ok.confirm) {
      t.eq("the source is recorded as the authorisation", ok.source, "authorized");
      t.eq("and the current list price is kept for the note", ok.currentDerivedCents, 9000);
      t.check(
        "which reads as plain English",
        (settlementNotesLine(facts(), ok) ?? "").includes("Paid $80.00") &&
          (settlementNotesLine(facts(), ok) ?? "").includes("now charges $90.00"),
        String(settlementNotesLine(facts(), ok))
      );
    }

    const noDrift = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: COMMUNITY_CUP,
      dropIn: null,
      attempt,
    });
    t.check("when nothing changed there is nothing to explain", noDrift.confirm, JSON.stringify(noDrift));
    if (noDrift.confirm) t.eq("so no note is written", settlementNotesLine(facts(), noDrift), null);

    const underpaid = validateBusinessFacts({
      facts: facts({ amountTotal: 100 }),
      registration: REGISTRATION,
      tournament: raisedEvent,
      dropIn: null,
      attempt,
    });
    t.check("an authorisation is not a blank cheque", !underpaid.confirm);
    if (!underpaid.confirm) t.check("and it names the authorised figure", underpaid.reason.includes("authorised 8000"));

    const wrongOwner = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: COMMUNITY_CUP,
      dropIn: null,
      attempt: { ...attempt, registration_id: "11111111-1111-4111-8111-111111111111" },
    });
    t.check("an authorisation for another registration cannot be borrowed", !wrongOwner.confirm);

    const wrongEvent = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: COMMUNITY_CUP,
      dropIn: null,
      attempt: { ...attempt, tournament_id: OPEN_PLAY.id },
    });
    t.check("nor one for another event", !wrongEvent.confirm);

    const wrongCurrency = validateBusinessFacts({
      facts: facts({ amountTotal: 8000, currency: "cad" }),
      registration: REGISTRATION,
      tournament: COMMUNITY_CUP,
      dropIn: null,
      attempt,
    });
    t.check("a foreign currency is refused before the authorisation is even read", !wrongCurrency.confirm);

    const unlinked = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: null,
      tournament: null,
      dropIn: null,
      attempt,
    });
    t.check("an authorisation with nothing local to confirm still only records", !unlinked.confirm);
  }

  /* ---------------------------------------------------------------- */
  /* 8. Legacy sessions keep the old rule                               */
  /* ---------------------------------------------------------------- */
  {
    // Every session created before stripe_checkout_attempts existed — the known
    // $80 Community Cup record among them — has no authorisation row, and must
    // keep settling by re-deriving from the event.
    const legacy = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: COMMUNITY_CUP,
      dropIn: null,
      attempt: null,
    });
    t.check("the $80 record's shape still converges with no authorisation row", legacy.confirm);
    if (legacy.confirm) t.eq("by deriving, and it says so", legacy.source, "derived");

    const legacyDrifted = validateBusinessFacts({
      facts: facts({ amountTotal: 8000 }),
      registration: REGISTRATION,
      tournament: { ...COMMUNITY_CUP, entry_fee_cents: 9000 },
      dropIn: null,
      attempt: null,
    });
    t.check("a legacy session whose event was re-priced is refused, as before", !legacyDrifted.confirm);
    if (!legacyDrifted.confirm) {
      t.check("with the familiar message", legacyDrifted.reason.includes("amount_mismatch: got 8000, expected 9000"));
    }
  }

  t.done();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
