/**
 * F-02 core: finalisation converges, validates, and never double-settles.
 *
 * Run: npx tsx scripts/test-payment-finalize.ts
 */
import { finalizeCheckoutSession, type CheckoutSessionFacts } from "../src/lib/payment-finalize";
import { Harness, InMemoryFinalizeStore } from "./_test-fakes";

const t = new Harness();

const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743"; // Community Cup (real id, no PII)
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c"; // the known F-02 row (id only)
const REG_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function facts(overrides: Partial<CheckoutSessionFacts> = {}): CheckoutSessionFacts {
  return {
    sessionId: "cs_test_fixture_1",
    paymentIntentId: "pi_test_fixture_1",
    mode: "payment",
    status: "complete",
    paymentStatus: "paid",
    amountTotal: 8000,
    currency: "usd",
    customerEmail: "player@example.com",
    clientReferenceId: null,
    metadata: {
      email: "player@example.com",
      tournament_id: EVENT_ID,
      registration_id: REG_ID,
      pay_kind: "entry",
    },
    ...overrides,
  };
}

function store(): InMemoryFinalizeStore {
  const s = new InMemoryFinalizeStore();
  s.tournaments.set(EVENT_ID, {
    id: EVENT_ID,
    title: "Community Cup - Fall 2026",
    slug: "community-cup-fall-2026",
    entry_fee_cents: 8000,
    drop_in_fee_cents: 0,
    stripe_price_id: "price_x",
  });
  s.tournaments.set(OTHER_EVENT_ID, {
    id: OTHER_EVENT_ID,
    title: "Other",
    slug: "other",
    entry_fee_cents: 1500,
    drop_in_fee_cents: 0,
    stripe_price_id: null,
  });
  s.registrations.set(REG_ID, {
    id: REG_ID,
    email: "player@example.com",
    tournament_id: EVENT_ID,
    contact_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    payment_status: "pending",
    cancelled_at: null,
    needs_admin_review: false,
    notes: null,
    team_name: null,
  });
  s.registrations.set(REG_OTHER, {
    id: REG_OTHER,
    email: "other@example.com",
    tournament_id: OTHER_EVENT_ID,
    contact_id: null,
    payment_status: "pending",
    cancelled_at: null,
    needs_admin_review: false,
    notes: null,
    team_name: null,
  });
  return s;
}

const webhook = (id: string) => ({ eventId: id, eventType: "checkout.session.completed" });
const app = { eventId: null, eventType: "app" };

async function main() {
  /* ---------- happy path ---------- */
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts(), s, webhook("evt_1"));
    t.eq("valid payment → finalized", out.status, "finalized");
    t.eq("registration confirmed", s.registrations.get(REG_ID)!.payment_status, "paid");
    t.eq("exactly one payments row", s.payments.size, 1);
    t.eq("payment linked to the registration", s.payments.get("cs_test_fixture_1")!.registration_id, REG_ID);
    t.eq("event recorded as processed", s.events.get("evt_1")?.processed, true);
  }

  /* ---------- duplicate delivery ---------- */
  {
    const s = store();
    await finalizeCheckoutSession(facts(), s, webhook("evt_dup"));
    const before = s.snapshot();
    const again = await finalizeCheckoutSession(facts(), s, webhook("evt_dup"));
    t.eq("same event id again → duplicate_event", again.status, "duplicate_event");
    t.check("duplicate delivery changed nothing", s.snapshot() === before);
  }

  /* ---------- duplicate business payment (new event id, same session) ---------- */
  {
    const s = store();
    await finalizeCheckoutSession(facts(), s, webhook("evt_a"));
    const second = await finalizeCheckoutSession(facts(), s, webhook("evt_b"));
    t.eq("same session under a new event id → finalized, no insert", [second.status, second.status === "finalized" && second.paymentInserted], ["finalized", false]);
    t.eq("still exactly one payments row for the session", s.payments.size, 1);
    t.eq("registration still paid once", s.registrations.get(REG_ID)!.payment_status, "paid");
    // Same payment intent under a different session id is refused by the unique index → error, never a second row.
    const clash = await finalizeCheckoutSession(facts({ sessionId: "cs_other_session" }), s, webhook("evt_c"));
    t.eq("same payment intent, different session → error (unique index), not a second payment", [clash.status, s.payments.size], ["error", 1]);
  }

  /* ---------- THE F-02 FIXTURE: payment row exists, registration pending ---------- */
  {
    const s = store();
    // Reproduce production: the ledger row was written, the registration flip was lost.
    s.payments.set("cs_test_fixture_1", {
      id: "bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7",
      stripe_session_id: "cs_test_fixture_1",
      stripe_payment_intent_id: "pi_test_fixture_1",
      registration_id: REG_ID,
      drop_in_id: null,
      tournament_id: EVENT_ID,
      contact_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "player@example.com",
      amount: 80,
      currency: "usd",
      status: "succeeded",
      notes: null,
    });
    t.eq("fixture: registration starts pending", s.registrations.get(REG_ID)!.payment_status, "pending");

    const out = await finalizeCheckoutSession(facts(), s, app);
    t.eq("reprocessing converges: finalized without inserting", [out.status, out.status === "finalized" && out.paymentInserted, out.status === "finalized" && out.registrationUpdated], ["finalized", false, true]);
    t.eq("registration is now paid", s.registrations.get(REG_ID)!.payment_status, "paid");
    t.eq("still one payments row, same id", [s.payments.size, s.payments.get("cs_test_fixture_1")!.id], [1, "bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7"]);

    const before = s.snapshot();
    const again = await finalizeCheckoutSession(facts(), s, app);
    t.eq("second convergence is a no-op (registrationUpdated=false)", again.status === "finalized" && again.registrationUpdated, false);
    t.check("repeated convergence changed nothing", s.snapshot() === before);
    // And via the webhook path with an event id, still no change.
    await finalizeCheckoutSession(facts(), s, webhook("evt_late"));
    t.check("late webhook replay after manual convergence changed nothing but the event ledger", s.registrations.get(REG_ID)!.payment_status === "paid" && s.payments.size === 1);
  }

  /* ---------- business validation ---------- */
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts({ amountTotal: 4000 }), s, webhook("evt_amt"));
    t.eq("amount mismatch → needs_review, not confirmed", [out.status, s.registrations.get(REG_ID)!.payment_status], ["needs_review", "pending"]);
    t.check("mismatch still recorded the money and flagged the row", s.payments.size === 1 && s.registrations.get(REG_ID)!.needs_admin_review === true && /amount_mismatch/.test(s.registrations.get(REG_ID)!.notes ?? ""));
  }
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts({ currency: "eur" }), s, webhook("evt_cur"));
    t.eq("currency mismatch → needs_review", [out.status, s.registrations.get(REG_ID)!.payment_status], ["needs_review", "pending"]);
  }
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts({ metadata: { ...facts().metadata, tournament_id: OTHER_EVENT_ID } }), s, webhook("evt_evt"));
    t.eq("metadata names a different event than the registration → needs_review", [out.status, s.registrations.get(REG_ID)!.payment_status], ["needs_review", "pending"]);
  }
  {
    const s = store();
    // Metadata points at a registration on another event whose price happens to be lower.
    const out = await finalizeCheckoutSession(facts({ amountTotal: 1500, metadata: { ...facts().metadata, registration_id: REG_OTHER } }), s, webhook("evt_swap"));
    t.eq("registration/event mismatch (stale metadata) → needs_review", [out.status, s.registrations.get(REG_OTHER)!.payment_status], ["needs_review", "pending"]);
  }
  {
    const s = store();
    // Stale metadata cannot change what is charged: expected amount is re-derived from the tournament row.
    s.tournaments.get(EVENT_ID)!.entry_fee_cents = 9000;
    const out = await finalizeCheckoutSession(facts({ metadata: { ...facts().metadata, pay_kind: "entry" } }), s, webhook("evt_price"));
    t.eq("event price changed since checkout → paid amount no longer matches → needs_review", out.status, "needs_review");
  }

  /* ---------- settlement semantics ---------- */
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts({ paymentStatus: "unpaid" }), s, webhook("evt_async"));
    t.eq("completed but unpaid (async method) → not_paid, nothing settled", [out.status, s.payments.size, s.registrations.get(REG_ID)!.payment_status], ["not_paid", 0, "pending"]);
    t.eq("unpaid completion recorded in the event ledger", s.events.get("evt_async")?.outcome, "not_paid");
    const later = await finalizeCheckoutSession(facts(), s, { eventId: "evt_async_ok", eventType: "checkout.session.async_payment_succeeded" });
    t.eq("async_payment_succeeded later → finalized", [later.status, s.registrations.get(REG_ID)!.payment_status], ["finalized", "paid"]);
  }

  /* ---------- infrastructure failure is not acknowledged ---------- */
  {
    const s = store();
    s.failNextFinalize = true;
    const out = await finalizeCheckoutSession(facts(), s, webhook("evt_fail"));
    t.eq("database failure → error, retryable", [out.status, out.status === "error" && out.retryable], ["error", true]);
    t.check("nothing was written and the event is not marked processed", s.payments.size === 0 && s.registrations.get(REG_ID)!.payment_status === "pending" && !s.events.get("evt_fail")?.processed);
    const retry = await finalizeCheckoutSession(facts(), s, webhook("evt_fail"));
    t.eq("Stripe's retry of the same event then succeeds", [retry.status, s.registrations.get(REG_ID)!.payment_status], ["finalized", "paid"]);
  }

  /* ---------- roster: no duplication possible ---------- */
  {
    const s = store();
    await finalizeCheckoutSession(facts(), s, webhook("evt_r1"));
    await finalizeCheckoutSession(facts(), s, webhook("evt_r2"));
    await finalizeCheckoutSession(facts(), s, app);
    t.eq("roster membership (the registration row) is one row however many times settlement runs", [...s.registrations.values()].filter((r) => r.email === "player@example.com").length, 1);
  }

  /* ---------- cancelled / waived registrations ---------- */
  {
    const s = store();
    s.registrations.get(REG_ID)!.cancelled_at = "2026-08-30T00:00:00.000Z";
    await finalizeCheckoutSession(facts(), s, webhook("evt_canc"));
    const r = s.registrations.get(REG_ID)!;
    t.check("payment after cancellation → marked paid AND flagged for a refund decision", r.payment_status === "paid" && r.needs_admin_review && /AFTER this spot was cancelled/.test(r.notes ?? ""));
  }
  {
    const s = store();
    s.registrations.get(REG_ID)!.payment_status = "waived";
    await finalizeCheckoutSession(facts(), s, webhook("evt_waived"));
    const r = s.registrations.get(REG_ID)!;
    t.check("payment for a waived registration → owner's decision kept, flagged", r.payment_status === "waived" && r.needs_admin_review);
  }

  /* ---------- drop-in ---------- */
  {
    const s = store();
    const DROP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    s.dropIns.set(DROP, { id: DROP, amount_cents: 1500, tournament_id: EVENT_ID, contact_id: null, payment_status: "pending" });
    const out = await finalizeCheckoutSession(facts({ amountTotal: 1500, metadata: { email: "g@example.com", tournament_id: EVENT_ID, drop_in_id: DROP, pay_kind: "drop_in" } }), s, webhook("evt_drop"));
    t.eq("drop-in paid at its own amount → finalized", [out.status, s.dropIns.get(DROP)!.payment_status], ["finalized", "paid"]);
    const bad = await finalizeCheckoutSession(facts({ sessionId: "cs_drop2", paymentIntentId: "pi_drop2", amountTotal: 500, metadata: { email: "g@example.com", tournament_id: EVENT_ID, drop_in_id: DROP, pay_kind: "drop_in" } }), s, webhook("evt_drop2"));
    t.eq("drop-in amount mismatch → needs_review", bad.status, "needs_review");
  }

  /* ---------- no local record ---------- */
  {
    const s = store();
    const out = await finalizeCheckoutSession(facts({ metadata: { email: "nobody@example.com", tournament_id: EVENT_ID } }), s, webhook("evt_none"));
    t.eq("no registration to match → money recorded, needs_review", [out.status, s.payments.size], ["needs_review", 1]);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
