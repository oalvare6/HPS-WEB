/**
 * F-02 webhook contract, with real Stripe signatures (test secret, no network).
 *
 * Run: npx tsx scripts/test-stripe-webhook.ts
 */
import Stripe from "stripe";
import { handleStripeWebhook } from "../src/lib/stripe-webhook";
import { Harness, InMemoryFinalizeStore } from "./_test-fakes";

const t = new Harness();

// Any string works: signature verification is local and never contacts Stripe.
// Deliberately NOT shaped like a real key so secret scanners have nothing to flag.
const stripe = new Stripe("placeholder-not-a-real-key", { apiVersion: "2026-02-25.clover" });
const SECRET = "whsec_test_secret_for_local_verification_only";

const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743";
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_wh_1",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 8000,
    currency: "usd",
    customer_email: "player@example.com",
    client_reference_id: REG_ID,
    payment_intent: "pi_test_wh_1",
    metadata: { email: "player@example.com", tournament_id: EVENT_ID, registration_id: REG_ID, pay_kind: "entry" },
    ...overrides,
  };
}

function event(type: string, id: string, obj: Record<string, unknown>) {
  return JSON.stringify({ id, object: "event", type, api_version: "2026-02-25.clover", created: Math.floor(Date.now() / 1000), data: { object: obj } });
}

function sign(payload: string, secret = SECRET) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function store() {
  const s = new InMemoryFinalizeStore();
  s.tournaments.set(EVENT_ID, { id: EVENT_ID, title: "Community Cup", slug: "community-cup-fall-2026", entry_fee_cents: 8000, drop_in_fee_cents: 0, stripe_price_id: null });
  s.registrations.set(REG_ID, { id: REG_ID, email: "player@example.com", tournament_id: EVENT_ID, contact_id: null, payment_status: "pending", cancelled_at: null, needs_admin_review: false, notes: null, team_name: null });
  return s;
}

const deps = (s: InMemoryFinalizeStore) => ({
  constructEvent: (body: string, sig: string, secret: string) => stripe.webhooks.constructEvent(body, sig, secret),
  webhookSecret: SECRET,
  store: s,
});

async function main() {
  {
    const s = store();
    const payload = event("checkout.session.completed", "evt_sig", session());
    const bad = await handleStripeWebhook(payload, sign(payload, "whsec_wrong"), deps(s));
    t.eq("wrong signature → 400", bad.status, 400);
    const none = await handleStripeWebhook(payload, null, deps(s));
    t.eq("missing signature → 400", none.status, 400);
    const unset = await handleStripeWebhook(payload, sign(payload), { ...deps(s), webhookSecret: "" });
    t.eq("unset webhook secret → 400 (fail closed)", unset.status, 400);
    t.check("rejected deliveries wrote nothing", s.payments.size === 0 && s.finalizeCalls === 0);
  }

  {
    const s = store();
    const payload = event("customer.created", "evt_irrelevant", { id: "cus_1", object: "customer" });
    const res = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("irrelevant event → 200, ignored", [res.status, (await res.json()).ignored], [200, true]);
    t.check("irrelevant event touched nothing", s.finalizeCalls === 0 && s.events.size === 0);
  }

  {
    const s = store();
    const payload = event("checkout.session.completed", "evt_ok", session());
    const res = await handleStripeWebhook(payload, sign(payload), deps(s));
    const body = await res.json();
    t.eq("valid completed+paid → 200 finalized", [res.status, body.outcome, body.registrationUpdated], [200, "finalized", true]);
    t.eq("registration confirmed", s.registrations.get(REG_ID)!.payment_status, "paid");

    const dup = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("duplicate delivery → 200 duplicate_event", [dup.status, (await dup.json()).outcome], [200, "duplicate_event"]);
    t.eq("still one payment", s.payments.size, 1);
  }

  {
    const s = store();
    const payload = event("checkout.session.completed", "evt_amt", session({ amount_total: 100 }));
    const res = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("amount mismatch → 200 needs_review, registration NOT confirmed", [res.status, (await res.json()).outcome, s.registrations.get(REG_ID)!.payment_status], [200, "needs_review", "pending"]);
  }

  {
    const s = store();
    const payload = event("checkout.session.completed", "evt_cur", session({ currency: "cad" }));
    const res = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("currency mismatch → registration NOT confirmed", [(await res.json()).outcome, s.registrations.get(REG_ID)!.payment_status], ["needs_review", "pending"]);
  }

  {
    const s = store();
    s.failNextFinalize = true;
    const payload = event("checkout.session.completed", "evt_db", session());
    const res = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("database failure → 500 so Stripe retries", res.status, 500);
    t.check("nothing acknowledged: no payment, event not processed", s.payments.size === 0 && !s.events.get("evt_db")?.processed);
    const retry = await handleStripeWebhook(payload, sign(payload), deps(s));
    t.eq("retry → 200 finalized", [retry.status, (await retry.json()).outcome], [200, "finalized"]);
  }

  {
    const s = store();
    const unpaid = event("checkout.session.completed", "evt_unpaid", session({ payment_status: "unpaid" }));
    const r1 = await handleStripeWebhook(unpaid, sign(unpaid), deps(s));
    t.eq("completed but unpaid → 200 not_paid, nothing settled", [r1.status, (await r1.json()).outcome, s.payments.size], [200, "not_paid", 0]);
    const failed = event("checkout.session.async_payment_failed", "evt_failed", session({ payment_status: "unpaid" }));
    const r2 = await handleStripeWebhook(failed, sign(failed), deps(s));
    t.eq("async_payment_failed → 200 recorded", [r2.status, s.events.get("evt_failed")?.outcome], [200, "payment_failed"]);
    const succeeded = event("checkout.session.async_payment_succeeded", "evt_succ", session());
    const r3 = await handleStripeWebhook(succeeded, sign(succeeded), deps(s));
    t.eq("async_payment_succeeded → finalized", [(await r3.json()).outcome, s.registrations.get(REG_ID)!.payment_status], ["finalized", "paid"]);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
