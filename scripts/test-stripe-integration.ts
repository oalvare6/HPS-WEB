/**
 * The whole settlement chain, end to end, against a real database (Stage 1.4).
 *
 *   npx tsx scripts/test-stripe-integration.ts
 *
 * `scripts/test-stripe-webhook.ts` proves the webhook CONTRACT against an
 * in-memory store; `scripts/test-finalize-sql.ts` proves the SQL. Neither joins
 * them. This one does:
 *
 *     Stripe-signed payload  →  handleStripeWebhook  →  finalizeCheckoutSession
 *       →  PgFinalizeStore  →  finalize_checkout_payment()  →  real rows
 *
 * so the assertions are about what the database ends up holding after a
 * delivery, not about what a fake recorded. Signatures are generated with the
 * Stripe SDK's own `generateTestHeaderString` and verified by `constructEvent`,
 * the same call the route makes — no network, no key.
 *
 * ## The sandbox seam
 *
 * There is no Stripe API key in this repository or its environment, so the
 * session objects here are constructed locally. `sessionFixture()` is built to
 * match the shape Stripe actually sends (see the field notes on it), and when
 * an operator exports a test-mode key the same suite can be re-pointed at real
 * objects:
 *
 *     STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/test-stripe-integration.ts --live-sandbox
 *
 * which creates real test-mode Checkout Sessions, retrieves them back from
 * Stripe and drives them through the identical assertions. Without the flag the
 * offline half runs and says so. The live half never touches live keys: it
 * refuses anything that is not `sk_test_`.
 */
import Stripe from "stripe";
import { handleStripeWebhook } from "../src/lib/stripe-webhook";
import { recordCheckoutSessionPayment } from "../src/lib/stripe-payments";
import { Harness } from "./_test-fakes";
import { PgFinalizeStore } from "./_pg-finalize-store";
import { lit, provisionTestDatabase, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

/* Local verification only; deliberately not shaped like a real key. */
const stripe = new Stripe("placeholder-not-a-real-key", { apiVersion: "2026-02-25.clover" });
const SECRET = "whsec_test_secret_for_local_verification_only";

const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743"; // Community Cup - Fall 2026
const OTHER_EVENT_ID = "6cc03ca6-84f5-4f36-a4ed-ce8dbfcde854"; // a second event, same player
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c";
const OTHER_REG_ID = "77777777-7777-4777-8777-777777777777";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const GUEST_CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const DROP_IN_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "player@example.com";

/**
 * A Checkout Session as Stripe sends it. Fields chosen to match a real
 * `checkout.session.completed` payload for a `mode: 'payment'` session:
 * `amount_total` in the smallest currency unit, lower-case `currency`,
 * `payment_status` separate from `status`, the PaymentIntent as a string id on
 * an un-expanded object, `customer_details.email` present alongside
 * `customer_email`, and `metadata` exactly as src/lib/stripe-checkout.ts writes
 * it (every key present, empty string for absent values — Stripe stores no
 * nulls in metadata).
 */
function sessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_integration_1",
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_subtotal: 8000,
    amount_total: 8000,
    currency: "usd",
    customer: null,
    customer_email: EMAIL,
    customer_details: { email: EMAIL, name: "Test Player" },
    client_reference_id: REG_ID,
    payment_intent: "pi_test_integration_1",
    metadata: {
      email: EMAIL,
      tournament_id: EVENT_ID,
      tournament_name: "Community Cup - Fall 2026",
      registration_id: REG_ID,
      drop_in_id: "",
      contact_id: CONTACT_ID,
      pay_kind: "entry",
      team_name: "",
      roster_size: "",
    },
    ...overrides,
  };
}

function eventEnvelope(type: string, id: string, obj: Record<string, unknown>) {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object: obj },
  });
}

const sign = (payload: string, secret = SECRET) => stripe.webhooks.generateTestHeaderString({ payload, secret });

const deps = (store: PgFinalizeStore) => ({
  constructEvent: (body: string, sig: string, secret: string) => stripe.webhooks.constructEvent(body, sig, secret),
  webhookSecret: SECRET,
  store,
});

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

async function seed(db: PgDb) {
  await db.exec(`
    truncate table public.payments, public.drop_ins, public.registrations,
                  public.teams, public.contacts, public.tournaments,
                  public.stripe_webhook_events, public.stripe_checkout_attempts,
                  public.registration_sessions, public.registration_access_tokens,
                  public.resume_link_requests
      restart identity cascade;

    insert into public.tournaments (id, title, slug, entry_fee_cents, entry_fee, drop_in_fee_cents, payments_open, status)
    values (${lit(EVENT_ID)}, 'Community Cup - Fall 2026', 'community-cup-fall-2026', 8000, 80, 0, true, 'upcoming'),
           (${lit(OTHER_EVENT_ID)}, 'Friday Open Play', 'friday-open-play', null, null, 1500, true, 'upcoming');

    insert into public.contacts (id, first_name, last_name, email)
    values (${lit(CONTACT_ID)}, 'Test', 'Player', ${lit(EMAIL)}),
           (${lit(GUEST_CONTACT_ID)}, 'Guest', 'Player', 'guest@example.com');

    insert into public.registrations
      (id, registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, tournament_id, contact_id, payment_status, created_at)
    values
      (${lit(REG_ID)}, 'adult', 'Test', 'Player', ${lit(EMAIL)}, '555', '1990-01-01',
       'ICE', '555', 'adult', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)}, 'pending', '2026-08-22T01:33:00Z'),
      (${lit(OTHER_REG_ID)}, 'adult', 'Test', 'Player', ${lit(EMAIL)}, '555', '1990-01-01',
       'ICE', '555', 'adult', ${lit(OTHER_EVENT_ID)}, ${lit(CONTACT_ID)}, 'pending', '2026-09-01T00:00:00Z');

    insert into public.drop_ins (id, tournament_id, contact_id, amount_cents, payment_status)
    values (${lit(DROP_IN_ID)}, ${lit(OTHER_EVENT_ID)}, ${lit(GUEST_CONTACT_ID)}, 1500, 'pending');
  `);
}

const reg = (db: PgDb, id = REG_ID) =>
  db.row<{ payment_status: string; needs_admin_review: boolean; notes: string | null; cancelled_at: string | null }>(
    `select payment_status, needs_admin_review, notes, cancelled_at from public.registrations where id = ${lit(id)}`
  );

const count = async (db: PgDb, table: string, where = "true") =>
  Number(await db.scalar(`select count(*) from public.${table} where ${where}`));

const eventRow = (db: PgDb, id: string) =>
  db.row<{ outcome: string | null; processed_at: string | null; object_id: string | null }>(
    `select outcome, processed_at, object_id from public.stripe_webhook_events where id = ${lit(id)}`
  );

/* ------------------------------------------------------------------ */

async function main() {
  if (skipRequested()) {
    console.log("SKIPPED  scripts/test-stripe-integration.ts — HPS_SKIP_PG_TESTS=1 was set.");
    console.log("         The webhook was NOT exercised against a database by this run.");
    process.exit(0);
  }

  const { db, note } = await provisionTestDatabase();
  console.log(`Database: ${note}`);
  console.log("Stripe: offline — payloads signed with the SDK's test helper and verified by constructEvent.");
  console.log("        Pass --live-sandbox with a sk_test_ key to also drive real test-mode sessions.\n");

  /* ---------------------------------------------------------------- */
  /* 1. A refused delivery must not reach the database at all          */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const payload = eventEnvelope("checkout.session.completed", "evt_sig", sessionFixture());

    t.eq("wrong signing secret → 400", (await handleStripeWebhook(payload, sign(payload, "whsec_wrong"), deps(store))).status, 400);
    t.eq("no signature header → 400", (await handleStripeWebhook(payload, null, deps(store))).status, 400);
    t.eq(
      "unset STRIPE_WEBHOOK_SECRET → 400, fail closed",
      (await handleStripeWebhook(payload, sign(payload), { ...deps(store), webhookSecret: "" })).status,
      400
    );
    t.eq("a tampered body → 400", (await handleStripeWebhook(payload.replace('"amount_total":8000', '"amount_total":1'), sign(payload), deps(store))).status, 400);

    t.eq("no refused delivery touched the database", store.calls.length, 0);
    t.eq("no payments row", await count(db, "payments"), 0);
    t.eq("no event row", await count(db, "stripe_webhook_events"), 0);
    t.eq("the registration is untouched", (await reg(db))!.payment_status, "pending");
  }

  /* ---------------------------------------------------------------- */
  /* 2. An event type we do not handle                                 */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const payload = eventEnvelope("customer.created", "evt_irrelevant", { id: "cus_1", object: "customer" });
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("an unhandled event type → 200 ignored", [res.status, (await res.json()).ignored], [200, true]);
    t.eq("...settles nothing", await count(db, "payments"), 0);
    // The durable proof that Stripe reaches this app: without it, an empty
    // table means either "no payments yet" or "every delivery dies at the edge".
    t.eq(
      "...but leaves a row saying the delivery arrived",
      await count(db, "stripe_webhook_events", `id = 'evt_irrelevant' and outcome = 'ignored' and processed_at is not null`),
      1
    );
  }

  /* ---------------------------------------------------------------- */
  /* 3. The path a real payment takes                                  */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const payload = eventEnvelope("checkout.session.completed", "evt_ok", sessionFixture());
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    const body = await res.json();
    t.eq("a paid session → 200 finalized", [res.status, body.outcome, body.registrationUpdated], [200, "finalized", true]);

    t.eq("the registration is paid", (await reg(db))!.payment_status, "paid");
    t.check("it is not flagged", (await reg(db))!.needs_admin_review === false);
    t.eq("one payments row", await count(db, "payments"), 1);

    const payment = await db.row<{ amount: string; currency: string; status: string; registration_id: string; contact_id: string; tournament_id: string }>(
      `select amount::text as amount, currency, status, registration_id, contact_id, tournament_id from public.payments`
    );
    t.eq("the ledger row carries the money and every link", [
      payment!.amount,
      payment!.currency,
      payment!.status,
      payment!.registration_id,
      payment!.contact_id,
      payment!.tournament_id,
    ], ["80.00", "usd", "succeeded", REG_ID, CONTACT_ID, EVENT_ID]);

    const ev = await eventRow(db, "evt_ok");
    t.eq("the delivery is in the durable trail", [ev?.outcome, ev?.object_id, ev?.processed_at !== null], [
      "finalized",
      "cs_test_integration_1",
      true,
    ]);
    t.eq("no registration was created", await count(db, "registrations"), 2);
  }

  /* ---------------------------------------------------------------- */
  /* 4. Stripe redelivers the same event                               */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const payload = eventEnvelope("checkout.session.completed", "evt_replay", sessionFixture());
    await handleStripeWebhook(payload, sign(payload), deps(store));
    // Pretend an admin undid it; a replay must not re-apply anything.
    await db.exec(`update public.registrations set payment_status = 'refunded' where id = ${lit(REG_ID)}`);

    const dup = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a redelivery → 200 duplicate_event", [dup.status, (await dup.json()).outcome], [200, "duplicate_event"]);
    t.eq("it changed nothing", (await reg(db))!.payment_status, "refunded");
    t.eq("still one payments row", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 5. Money that does not match the rows is recorded, never confirmed */
  /* ---------------------------------------------------------------- */
  {
    const cases: [string, Record<string, unknown>, string][] = [
      ["an amount Stripe charged that the event does not price", { amount_total: 100 }, "amount_mismatch"],
      ["a currency we do not price in", { currency: "cad" }, "currency_mismatch"],
      [
        "metadata naming a different event from the registration's",
        { metadata: { ...sessionFixture().metadata, tournament_id: OTHER_EVENT_ID } },
        "event_mismatch",
      ],
    ];
    for (const [name, override, expectedReason] of cases) {
      await seed(db);
      const store = new PgFinalizeStore(db);
      const payload = eventEnvelope("checkout.session.completed", `evt_${expectedReason}`, sessionFixture({ ...override, id: `cs_${expectedReason}` }));
      const res = await handleStripeWebhook(payload, sign(payload), deps(store));
      t.eq(`${name} → 200 needs_review`, [res.status, (await res.json()).outcome], [200, "needs_review"]);

      const r = await reg(db);
      t.eq(`${name}: registration NOT confirmed`, r!.payment_status, "pending");
      t.check(`${name}: registration flagged for the owner`, r!.needs_admin_review === true);
      t.check(`${name}: the reason is written down`, (r!.notes ?? "").includes(expectedReason), `notes: ${r!.notes}`);
      t.eq(`${name}: the money is still recorded`, await count(db, "payments"), 1);
      t.eq(`${name}: the delivery is marked reviewed, not lost`, (await eventRow(db, `evt_${expectedReason}`))?.outcome, "recorded_needs_review");
    }
  }

  /* ---------------------------------------------------------------- */
  /* 5b. A fee edited while a session is open (Stage 1.4.1)             */
  /* ---------------------------------------------------------------- */
  // The owner can edit an event's fee at any time, including while somebody has
  // a Checkout Session open. Two cases, and they must end differently.
  //
  // (a) LEGACY session — created before stripe_checkout_attempts existed, so
  //     there is no record of what was authorised. Settlement can only re-derive
  //     from the event, sees the new price, and refuses to confirm. This is the
  //     old behaviour, kept deliberately: with nothing recorded there is no
  //     honest way to know what the customer was quoted.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`update public.tournaments set entry_fee_cents = 9000, entry_fee = 90 where id = ${lit(EVENT_ID)}`);

    const payload = eventEnvelope("checkout.session.completed", "evt_legacy_drift", sessionFixture({ id: "cs_legacy_drift" }));
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a legacy session paid at the old price → needs_review", (await res.json()).outcome, "needs_review");
    t.eq("the player paid but is not confirmed", (await reg(db))!.payment_status, "pending");
    t.check(
      "the owner is told the amounts disagree",
      ((await reg(db))!.notes ?? "").includes("amount_mismatch: got 8000, expected 9000")
    );
    t.eq("the money is recorded either way", await count(db, "payments"), 1);
  }

  // (b) A session created NOW records what it authorised, so the same edit no
  //     longer punishes the customer: they paid exactly what we quoted them.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`
      insert into public.stripe_checkout_attempts
        (stripe_session_id, amount_cents, currency, registration_id, tournament_id, pay_kind)
      values ('cs_authorized_80', 8000, 'usd', ${lit(REG_ID)}, ${lit(EVENT_ID)}, 'entry');
    `);
    // ...and only afterwards does the owner put the price up.
    await db.exec(`update public.tournaments set entry_fee_cents = 9000, entry_fee = 90 where id = ${lit(EVENT_ID)}`);

    const payload = eventEnvelope("checkout.session.completed", "evt_authorized", sessionFixture({ id: "cs_authorized_80" }));
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("the session settles at the price it was authorised for", (await res.json()).outcome, "finalized");
    t.eq("the player is confirmed", (await reg(db))!.payment_status, "paid");
    t.eq("and not flagged — nothing went wrong", (await reg(db))!.needs_admin_review, false);
    t.check(
      "the row explains the difference in plain language",
      ((await reg(db))!.notes ?? "").includes("Paid $80.00") && ((await reg(db))!.notes ?? "").includes("now charges $90.00"),
      `notes: ${(await reg(db))!.notes}`
    );

    // Convergence must not restate the note every time it runs.
    const notesOnce = (await reg(db))!.notes;
    await db.exec(`update public.registrations set payment_status = 'pending' where id = ${lit(REG_ID)}`);
    const again = eventEnvelope("checkout.session.completed", "evt_authorized_2", sessionFixture({ id: "cs_authorized_80" }));
    await handleStripeWebhook(again, sign(again), deps(store));
    t.eq("re-settling does not repeat the note", (await reg(db))!.notes, notesOnce);
  }

  // (c) The authorisation is not a blank cheque: paying something OTHER than
  //     the authorised amount is still refused.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`
      insert into public.stripe_checkout_attempts
        (stripe_session_id, amount_cents, currency, registration_id, tournament_id, pay_kind)
      values ('cs_authorized_80b', 8000, 'usd', ${lit(REG_ID)}, ${lit(EVENT_ID)}, 'entry');
    `);
    const payload = eventEnvelope(
      "checkout.session.completed",
      "evt_underpaid",
      sessionFixture({ id: "cs_authorized_80b", amount_total: 100 })
    );
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("paying less than the authorised amount → needs_review", (await res.json()).outcome, "needs_review");
    t.eq("not confirmed", (await reg(db))!.payment_status, "pending");
    t.check(
      "and the reason names the authorised figure",
      ((await reg(db))!.notes ?? "").includes("authorised 8000"),
      `notes: ${(await reg(db))!.notes}`
    );
  }

  // (d) An authorisation belonging to a different registration cannot be
  //     borrowed to confirm this one.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`
      insert into public.stripe_checkout_attempts
        (stripe_session_id, amount_cents, currency, registration_id, tournament_id, pay_kind)
      values ('cs_wrong_owner', 8000, 'usd', ${lit(OTHER_REG_ID)}, ${lit(OTHER_EVENT_ID)}, 'entry');
    `);
    const payload = eventEnvelope("checkout.session.completed", "evt_wrong_owner", sessionFixture({ id: "cs_wrong_owner" }));
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("an authorisation for another registration → needs_review", (await res.json()).outcome, "needs_review");
    t.check(
      "and says so",
      ((await reg(db))!.notes ?? "").includes("authorization_mismatch"),
      `notes: ${(await reg(db))!.notes}`
    );
  }

  // (e) The same protection for a drop-in whose fee an admin edits after
  //     texting the pay link.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`
      insert into public.stripe_checkout_attempts
        (stripe_session_id, amount_cents, currency, drop_in_id, tournament_id, pay_kind)
      values ('cs_dropin_authorized', 1500, 'usd', ${lit(DROP_IN_ID)}, ${lit(OTHER_EVENT_ID)}, 'drop_in');
      update public.drop_ins set amount_cents = 2000 where id = ${lit(DROP_IN_ID)};
    `);
    const dropIn = sessionFixture({
      id: "cs_dropin_authorized",
      amount_total: 1500,
      amount_subtotal: 1500,
      client_reference_id: null,
      customer_email: "guest@example.com",
      customer_details: { email: "guest@example.com", name: "Guest Player" },
      metadata: {
        email: "guest@example.com",
        tournament_id: OTHER_EVENT_ID,
        tournament_name: "Friday Open Play",
        registration_id: "",
        drop_in_id: DROP_IN_ID,
        contact_id: GUEST_CONTACT_ID,
        pay_kind: "drop_in",
        team_name: "",
        roster_size: "",
      },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_dropin_authorized", dropIn);
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a drop-in settles at the amount its link was created for", (await res.json()).outcome, "finalized");
    t.eq(
      "the guest is marked paid",
      await db.scalar(`select payment_status from public.drop_ins where id = ${lit(DROP_IN_ID)}`),
      "paid"
    );
  }

  /* ---------------------------------------------------------------- */
  /* 6. Asynchronous payment methods                                   */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);

    const unpaid = eventEnvelope("checkout.session.completed", "evt_unpaid", sessionFixture({ payment_status: "unpaid" }));
    const r1 = await handleStripeWebhook(unpaid, sign(unpaid), deps(store));
    t.eq("completed but unpaid → 200 not_paid, nothing settled", [r1.status, (await r1.json()).outcome, await count(db, "payments")], [
      200,
      "not_paid",
      0,
    ]);
    t.eq("the unpaid completion is still recorded for the trail", (await eventRow(db, "evt_unpaid"))?.outcome, "not_paid");
    t.eq("the registration is untouched", (await reg(db))!.payment_status, "pending");

    const failed = eventEnvelope("checkout.session.async_payment_failed", "evt_failed", sessionFixture({ payment_status: "unpaid" }));
    const r2 = await handleStripeWebhook(failed, sign(failed), deps(store));
    t.eq("async_payment_failed → 200, recorded", [r2.status, (await eventRow(db, "evt_failed"))?.outcome], [200, "payment_failed"]);
    t.eq("a failed payment settles nothing", await count(db, "payments"), 0);

    const succeeded = eventEnvelope("checkout.session.async_payment_succeeded", "evt_async_ok", sessionFixture());
    const r3 = await handleStripeWebhook(succeeded, sign(succeeded), deps(store));
    t.eq("async_payment_succeeded settles it later", [(await r3.json()).outcome, (await reg(db))!.payment_status], [
      "finalized",
      "paid",
    ]);
    t.eq("one payments row for the whole sequence", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 7. Legacy sessions with no registration id in metadata            */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const legacy = sessionFixture({
      id: "cs_legacy",
      client_reference_id: null,
      metadata: { email: EMAIL, tournament_id: EVENT_ID, pay_kind: "entry" },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_legacy", legacy);
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a legacy session resolves by email WITHIN the named event", [(await res.json()).outcome, (await reg(db))!.payment_status], [
      "finalized",
      "paid",
    ]);
    t.eq("the player's other event was not touched", (await reg(db, OTHER_REG_ID))!.payment_status, "pending");
  }

  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    await db.exec(`update public.registrations set cancelled_at = now() where id = ${lit(REG_ID)}`);
    const legacy = sessionFixture({
      id: "cs_legacy_cancelled",
      client_reference_id: null,
      metadata: { email: EMAIL, tournament_id: EVENT_ID, pay_kind: "entry" },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_legacy_cancelled", legacy);
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq(
      "the email fallback ignores a cancelled spot rather than resurrecting it",
      [(await res.json()).outcome, (await reg(db))!.payment_status],
      ["needs_review", "pending"]
    );
    t.eq("the money is recorded unlinked so nothing is lost", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 8. A local failure is never acknowledged                          */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    store.failNextFinalize = true;
    const payload = eventEnvelope("checkout.session.completed", "evt_dbfail", sessionFixture());
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a database failure → 500 so Stripe retries", res.status, 500);
    t.eq("nothing was written", await count(db, "payments"), 0);
    t.eq("and the event was not marked processed", await count(db, "stripe_webhook_events", `id = 'evt_dbfail' and processed_at is not null`), 0);

    const retry = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("the retry settles it", [retry.status, (await retry.json()).outcome, (await reg(db))!.payment_status], [
      200,
      "finalized",
      "paid",
    ]);
  }

  /* ---------------------------------------------------------------- */
  /* 9. THE $80 RECORD, through the webhook                            */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    // Production as of 2026-09-10: the old two-statement writer left the money
    // recorded and the registration pending.
    await db.exec(`
      insert into public.payments
        (registration_id, email, amount, currency, tournament_name, stripe_session_id,
         stripe_payment_intent_id, status, tournament_id, contact_id, created_at)
      values (${lit(REG_ID)}, ${lit(EMAIL)}, 80.00, 'usd', 'Community Cup - Fall 2026',
              'cs_live_known', 'pi_live_known', 'succeeded', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)},
              '2026-08-22T01:33:36Z');
    `);

    const payload = eventEnvelope(
      "checkout.session.completed",
      "evt_known_replay",
      sessionFixture({ id: "cs_live_known", payment_intent: "pi_live_known" })
    );
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("replaying the event from the Stripe dashboard repairs it", [res.status, (await res.json()).outcome], [200, "finalized"]);
    t.eq("the registration is paid at last", (await reg(db))!.payment_status, "paid");
    t.eq("no second charge appears in the ledger", await count(db, "payments"), 1);
    t.eq("and it is not flagged for review", (await reg(db))!.needs_admin_review, false);

    // The success page / admin sync route reaches the same place with no event id.
    await db.exec(`update public.registrations set payment_status = 'pending' where id = ${lit(REG_ID)}`);
  }

  /* ---------------------------------------------------------------- */
  /* 10. The success page and admin sync converge to the same state    */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await db.exec(`
      insert into public.payments
        (registration_id, email, amount, currency, stripe_session_id, stripe_payment_intent_id,
         status, tournament_id, contact_id)
      values (${lit(REG_ID)}, ${lit(EMAIL)}, 80.00, 'usd', 'cs_live_known2', 'pi_live_known2',
              'succeeded', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)});
    `);
    // recordCheckoutSessionPayment() is what /pay/success and /api/admin/sync-payments
    // call. It goes through the same finaliser with no event id, so business
    // convergence still happens but delivery idempotency does not apply.
    const outcome = await recordCheckoutSessionPayment(
      sessionFixture({ id: "cs_live_known2", payment_intent: "pi_live_known2" }) as unknown as Stripe.Checkout.Session,
      new PgFinalizeStore(db)
    );
    t.eq("the success page reports 'already recorded' for money it did not insert", outcome.status, "already_recorded");
    t.eq("...and still converges the registration", (await reg(db))!.payment_status, "paid");
    t.eq("without a second ledger row", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 11. A guest drop-in                                               */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const dropIn = sessionFixture({
      id: "cs_dropin",
      amount_total: 1500,
      amount_subtotal: 1500,
      client_reference_id: null,
      customer_email: "guest@example.com",
      customer_details: { email: "guest@example.com", name: "Guest Player" },
      metadata: {
        email: "guest@example.com",
        tournament_id: OTHER_EVENT_ID,
        tournament_name: "Friday Open Play",
        registration_id: "",
        drop_in_id: DROP_IN_ID,
        contact_id: GUEST_CONTACT_ID,
        pay_kind: "drop_in",
        team_name: "",
        roster_size: "",
      },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_dropin", dropIn);
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("a drop-in settles", [(await res.json()).outcome, await db.scalar(`select payment_status from public.drop_ins where id = ${lit(DROP_IN_ID)}`)], [
      "finalized",
      "paid",
    ]);
    t.eq("no registration was confirmed by a guest fee", (await reg(db))!.payment_status, "pending");
  }

  /* ---------------------------------------------------------------- */
  /* 12. Stale metadata pointing at rows that were cleaned up          */
  /* ---------------------------------------------------------------- */
  // `contact_id` and `tournament_id` reach the ledger insert straight from
  // Stripe metadata — they are the only ids in `FinalizeArgs` that are never
  // re-read (src/lib/payment-finalize.ts, the `metaContactId ?? …` fallback and
  // `… ?? metaTournamentId`). Metadata is frozen at checkout, so once the row it
  // names is deleted, EVERY retry fails identically: the webhook 500s, Stripe
  // retries for three days, and the money is never recorded. This is the shape
  // the 2026-08-17 contact cleanup could have produced, and the shape the
  // reconciler could walk into when it reprocesses 90 days of sessions.
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const deletedContact = "88888888-8888-4888-8888-888888888888";
    const stale = sessionFixture({
      id: "cs_stale_contact",
      payment_intent: "pi_stale_contact",
      metadata: { ...sessionFixture().metadata, contact_id: deletedContact },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_stale_contact", stale);

    const first = await handleStripeWebhook(payload, sign(payload), deps(store));
    const second = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq(
      "a contact id in metadata that no longer exists is tolerated, not fatal",
      [first.status, second.status],
      [200, 200]
    );
    t.eq("the money is recorded", await count(db, "payments"), 1);
    t.eq("the dead link is dropped rather than written", await count(db, "payments", `contact_id is null`), 1);
    t.check(
      "and the payment row says why",
      ((await db.scalar(`select coalesce(notes,'') from public.payments`)) ?? "").includes("no longer exists"),
      (await db.scalar(`select coalesce(notes,'') from public.payments`)) ?? ""
    );
    t.eq("the registration still confirms — a dead contact link is not the player's problem", (await reg(db))!.payment_status, "paid");
  }

  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const deletedEvent = "99999999-9999-4999-8999-999999999999";
    const stale = sessionFixture({
      id: "cs_stale_event",
      payment_intent: "pi_stale_event",
      client_reference_id: null,
      metadata: { email: EMAIL, tournament_id: deletedEvent, pay_kind: "entry" },
    });
    const payload = eventEnvelope("checkout.session.completed", "evt_stale_event", stale);
    const res = await handleStripeWebhook(payload, sign(payload), deps(store));
    t.eq("an event id in metadata that no longer exists → 200, money recorded, flagged", [res.status, (await res.json()).outcome], [
      200,
      "needs_review",
    ]);
    t.eq("the money is not lost", await count(db, "payments"), 1);
    t.eq("the dead event link is dropped", await count(db, "payments", `tournament_id is null`), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 13. Two deliveries racing on one session                          */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const store = new PgFinalizeStore(db);
    const completed = eventEnvelope("checkout.session.completed", "evt_race_a", sessionFixture({ id: "cs_race" }));
    const async = eventEnvelope("checkout.session.async_payment_succeeded", "evt_race_b", sessionFixture({ id: "cs_race" }));
    const [a, b] = await Promise.all([
      handleStripeWebhook(completed, sign(completed), deps(store)),
      handleStripeWebhook(async, sign(async), deps(store)),
    ]);
    t.eq("both deliveries are acknowledged", [a.status, b.status], [200, 200]);
    t.eq("one payments row survives the race", await count(db, "payments"), 1);
    t.eq("the registration is paid", (await reg(db))!.payment_status, "paid");
  }

  /* ---------------------------------------------------------------- */
  /* 14. The live sandbox half                                         */
  /* ---------------------------------------------------------------- */
  await liveSandbox(db);

  t.done();
}

/**
 * With a real Stripe TEST key, create genuine test-mode Checkout Sessions and
 * run the same assertions against the objects Stripe actually returns. This is
 * the half that catches a fixture drifting from reality.
 */
async function liveSandbox(db: PgDb) {
  if (!process.argv.includes("--live-sandbox")) {
    console.log("\n(--live-sandbox not requested: no real Stripe object was created or retrieved.)");
    return;
  }
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    console.error("\n--live-sandbox requires STRIPE_SECRET_KEY to be a sk_test_ key. Refusing to run.");
    process.exit(2);
  }

  const live = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  await seed(db);
  const store = new PgFinalizeStore(db);

  const created = await live.checkout.sessions.create({
    mode: "payment",
    customer_email: EMAIL,
    client_reference_id: REG_ID,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 8000,
          product_data: { name: "Community Cup - Fall 2026", description: "Stage 1.4 sandbox validation" },
        },
      },
    ],
    metadata: sessionFixture().metadata as unknown as Stripe.MetadataParam,
    success_url: "https://www.houstonpremiersoccer.com/pay/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://www.houstonpremiersoccer.com/pay",
  });

  const retrieved = await live.checkout.sessions.retrieve(created.id);
  t.eq("a real test-mode session is mode=payment and unpaid until someone pays", [retrieved.mode, retrieved.payment_status], [
    "payment",
    "unpaid",
  ]);
  t.eq("its amount and currency are what we asked for", [retrieved.amount_total, retrieved.currency], [8000, "usd"]);
  t.eq("our metadata survives the round trip", retrieved.metadata?.registration_id, REG_ID);

  // Field-by-field: the offline fixture must not have drifted from reality.
  const fixtureKeys = Object.keys(sessionFixture());
  const missing = fixtureKeys.filter((k) => !(k in (retrieved as unknown as Record<string, unknown>)));
  t.eq("every field the offline fixture asserts on exists on a real session", missing, []);

  const payload = eventEnvelope("checkout.session.completed", `evt_live_${retrieved.id}`, {
    ...(retrieved as unknown as Record<string, unknown>),
    payment_status: "paid",
    status: "complete",
  });
  const res = await handleStripeWebhook(payload, sign(payload), deps(store));
  t.eq("a real session object drives the same settlement", [(await res.json()).outcome, (await reg(db))!.payment_status], [
    "finalized",
    "paid",
  ]);

  await live.checkout.sessions.expire(retrieved.id).catch(() => undefined);
  console.log(`\n(live sandbox: created and expired test session ${retrieved.id})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
