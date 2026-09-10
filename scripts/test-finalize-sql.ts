/**
 * The F-02 settlement functions, EXECUTED (Stage 1.4).
 *
 *   npx tsx scripts/test-finalize-sql.ts
 *
 * `remediation_stage_1_2_report.md` §8 ends with "What the tests do not prove:
 * the two SQL functions were reviewed by hand and mirrored in
 * scripts/_test-fakes.ts, but **not executed**", and §17 lists the assumptions
 * that were therefore taken on trust. This file runs them against a real
 * PostgreSQL holding the production-shaped schema, and asserts the assumptions
 * rather than restating them:
 *
 *   §17.1  the functions run at all, and the exact smoke calls the report
 *          prescribes return what it says they will
 *   §17.2  `xmax = 0` in RETURNING really does distinguish an INSERT from an
 *          ON CONFLICT UPDATE on this server
 *
 * plus the parts of the design that only a real database can settle: the
 * event-row lock under genuine concurrency, the partial unique index on
 * stripe_payment_intent_id, all-or-nothing rollback, numeric(10,2) rounding,
 * the note dedupe, RLS and the grant posture.
 *
 * No application code is imported here on purpose — this is the SQL under test,
 * nothing else. `scripts/test-stripe-integration.ts` drives the same database
 * through the webhook handler.
 */
import { Harness } from "./_test-fakes";
import { jsonLit, lit, provisionTestDatabase, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

/* The real production identifiers, so the $80 case reads as the record it is. */
const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743"; // Community Cup - Fall 2026
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c"; // the registration stuck 'pending'
const PAYMENT_ID = "bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7"; // its succeeded $80 payment
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REG_ID = "22222222-2222-4222-8222-222222222222";
const DROP_IN_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CONTACT_ID = "44444444-4444-4444-8444-444444444444";

type TryResult = { ok: boolean; sqlstate?: string; message?: string };

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

async function installTestHelpers(db: PgDb) {
  // Runs a statement and reports the SQLSTATE instead of aborting. The
  // exception handler opens a subtransaction, so this is used ONLY for
  // error-code assertions — never for the rollback tests, which need the
  // real transaction boundary.
  await db.exec(`
    create or replace function public.__test_try(p_sql text) returns jsonb
    language plpgsql as $fn$
    begin
      execute p_sql;
      return jsonb_build_object('ok', true);
    exception when others then
      return jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM);
    end;
    $fn$;
  `);
}

async function seed(db: PgDb) {
  await db.exec(`
    truncate table public.payments, public.drop_ins, public.registrations,
                  public.teams, public.contacts, public.tournaments,
                  public.stripe_webhook_events, public.stripe_checkout_attempts,
                  public.registration_sessions, public.registration_access_tokens,
                  public.resume_link_requests
      restart identity cascade;

    insert into public.tournaments (id, title, slug, entry_fee_cents, entry_fee, drop_in_fee_cents, payments_open, status)
    values (${lit(EVENT_ID)}, 'Community Cup - Fall 2026', 'community-cup-fall-2026', 8000, 80, 0, true, 'upcoming');

    insert into public.contacts (id, first_name, last_name, email)
    values (${lit(CONTACT_ID)}, 'Test', 'Player', 'player@example.com'),
           (${lit(OTHER_CONTACT_ID)}, 'Other', 'Player', 'other@example.com');

    insert into public.registrations
      (id, registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, tournament_id, contact_id, payment_status)
    values
      (${lit(REG_ID)}, 'adult', 'Test', 'Player', 'player@example.com', '555', '1990-01-01',
       'ICE', '555', 'adult', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)}, 'pending');

    insert into public.drop_ins (id, tournament_id, contact_id, amount_cents, payment_status)
    values (${lit(DROP_IN_ID)}, ${lit(EVENT_ID)}, ${lit(OTHER_CONTACT_ID)}, 1500, 'pending');
  `);
}

type FinalizeInput = Record<string, unknown>;

function args(overrides: FinalizeInput = {}): FinalizeInput {
  return {
    event_id: null,
    event_type: "app",
    session_id: "cs_test_default",
    payment_intent_id: "pi_test_default",
    email: "player@example.com",
    amount_cents: 8000,
    currency: "usd",
    tournament_id: EVENT_ID,
    tournament_name: "Community Cup - Fall 2026",
    registration_id: REG_ID,
    drop_in_id: null,
    contact_id: CONTACT_ID,
    confirm: true,
    review_note: null,
    team_name: null,
    notes_line: null,
    ...overrides,
  };
}

const finalize = (db: PgDb, overrides: FinalizeInput = {}) =>
  db.json<Record<string, unknown>>(`public.finalize_checkout_payment(p => ${jsonLit(args(overrides))})`);

/** Run a statement and get its SQLSTATE back instead of an abort. */
const tryStatement = (db: PgDb, sql: string) => db.json<TryResult>(`public.__test_try(${lit(sql)})`);

const tryFinalize = (db: PgDb, overrides: FinalizeInput = {}) =>
  tryStatement(db, `select public.finalize_checkout_payment(p => ${jsonLit(args(overrides))})`);

/** Run something as another role, inside a transaction that is rolled back. */
const asRole = (db: PgDb, role: string, sql: string) =>
  db.scalar(`begin; set local role ${role}; ${sql.trim().replace(/;\s*$/, "")}; rollback;`);

const registration = (db: PgDb, id = REG_ID) =>
  db.row<{
    payment_status: string;
    needs_admin_review: boolean;
    notes: string | null;
    team_name: string | null;
    cancelled_at: string | null;
    updated_at: string;
  }>(
    `select payment_status, needs_admin_review, notes, team_name, cancelled_at, updated_at
       from public.registrations where id = ${lit(id)}`
  );

const payments = (db: PgDb) =>
  db.rows<{
    id: string;
    // amount is cast to text on purpose: row_to_json renders numeric as a JSON
    // number, which would hide the scale that numeric(10,2) is there to enforce
    // (80 and 80.00 are the same number and a different stored value).
    amount: string;
    currency: string;
    status: string;
    stripe_session_id: string | null;
    stripe_payment_intent_id: string | null;
    registration_id: string | null;
    contact_id: string | null;
    tournament_id: string | null;
    drop_in_id: string | null;
    notes: string | null;
    created_at: string;
  }>(
    `select id, amount::text as amount, currency, status, stripe_session_id, stripe_payment_intent_id,
            registration_id, contact_id, tournament_id, drop_in_id, notes, created_at::text as created_at
       from public.payments order by created_at, id`
  );

const count = async (db: PgDb, table: string, where = "true") =>
  Number(await db.scalar(`select count(*) from public.${table} where ${where}`));

/* ------------------------------------------------------------------ */

async function main() {
  if (skipRequested()) {
    console.log("SKIPPED  scripts/test-finalize-sql.ts — HPS_SKIP_PG_TESTS=1 was set.");
    console.log("         The F-02 SQL functions were NOT executed by this run.");
    process.exit(0);
  }

  const { db, note } = await provisionTestDatabase();
  console.log(`Database: ${note}`);
  console.log(`Production runs PostgreSQL 17.6.1; anything version-sensitive is asserted below, not assumed.\n`);
  await installTestHelpers(db);

  /* ---------------------------------------------------------------- */
  /* 1. The migration produced what it claims                          */
  /* ---------------------------------------------------------------- */
  {
    const objects = await db.rows<{ name: string }>(`
      select p.proname || '/' || p.pronargs as name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('finalize_checkout_payment','record_stripe_webhook_event','append_note_line')
       order by 1
    `);
    t.eq(
      "migration creates the three functions with the documented arities",
      objects.map((o) => o.name),
      ["append_note_line/2", "finalize_checkout_payment/1", "record_stripe_webhook_event/5"]
    );

    const table = await db.row<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.stripe_webhook_events'::regclass`
    );
    t.check("stripe_webhook_events has RLS enabled", table?.relrowsecurity === true);

    const grants = await db.rows<{ grantee: string }>(`
      select grantee from information_schema.routine_privileges
       where routine_schema = 'public' and routine_name = 'finalize_checkout_payment'
         and privilege_type = 'EXECUTE'
       order by grantee
    `);
    const names = grants.map((g) => g.grantee);
    t.check(
      "finalize_checkout_payment: execute granted to service_role, not to anon/authenticated/PUBLIC",
      names.includes("service_role") && !names.includes("anon") && !names.includes("authenticated") && !names.includes("PUBLIC"),
      `grantees: ${names.join(", ") || "none"}`
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. §17.1 — the report's own smoke calls                           */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const minimal = { session_id: "cs_test_x", email: "t@example.com", amount_cents: 100, confirm: false };
    const first = await db.json<Record<string, unknown>>(
      `public.finalize_checkout_payment(p => ${jsonLit(minimal)})`
    );
    t.eq("§17.1 first call → recorded_needs_review, payment inserted", [first.outcome, first.payment_inserted], [
      "recorded_needs_review",
      true,
    ]);

    const second = await db.json<Record<string, unknown>>(
      `public.finalize_checkout_payment(p => ${jsonLit(minimal)})`
    );
    t.eq(
      "§17.2 second call → same payment id, payment_inserted=false (xmax=0 distinguishes insert from update)",
      [second.payment_id, second.payment_inserted],
      [first.payment_id, false]
    );
    t.eq("still exactly one payments row", await count(db, "payments"), 1);

    const stored = (await payments(db))[0];
    t.eq("100 cents stored as 1.00 in numeric(10,2)", stored.amount, "1.00");
    t.eq("a payment recorded without validation is still 'succeeded' money", stored.status, "succeeded");
  }

  /* ---------------------------------------------------------------- */
  /* 3. Required arguments fail closed                                 */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const missingSession = await db.json<TryResult>(
      `public.__test_try('select public.finalize_checkout_payment(''{"email":"a@b.c","amount_cents":1}''::jsonb)')`
    );
    t.eq("missing session_id → 22023, nothing written", [missingSession.ok, missingSession.sqlstate], [false, "22023"]);

    const missingEmail = await db.json<TryResult>(
      `public.__test_try('select public.finalize_checkout_payment(''{"session_id":"cs_a","amount_cents":1}''::jsonb)')`
    );
    t.eq("missing email → 22023", [missingEmail.ok, missingEmail.sqlstate], [false, "22023"]);

    const negative = await tryFinalize(db, { amount_cents: -1 });
    t.eq("negative amount → 22023", [negative.ok, negative.sqlstate], [false, "22023"]);

    t.eq("no refused call wrote a payments row", await count(db, "payments"), 0);
  }

  /* ---------------------------------------------------------------- */
  /* 4. The happy path, and business convergence without an event id   */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const r1 = await finalize(db, { session_id: "cs_happy", payment_intent_id: "pi_happy" });
    t.eq(
      "confirm=true on a pending registration → finalized, registration updated",
      [r1.outcome, r1.registration_updated, r1.registration_status, r1.payment_inserted],
      ["finalized", true, "paid", true]
    );
    t.eq("registration is paid", (await registration(db))!.payment_status, "paid");

    const r2 = await finalize(db, { session_id: "cs_happy", payment_intent_id: "pi_happy" });
    t.eq(
      "a second business call is a no-op: no new payment, no re-update",
      [r2.outcome, r2.payment_inserted, r2.registration_updated, r2.registration_status],
      ["finalized", false, false, "paid"]
    );
    t.eq("still one payments row", await count(db, "payments"), 1);
    t.eq("8000 cents stored as 80.00", (await payments(db))[0].amount, "80.00");
  }

  /* ---------------------------------------------------------------- */
  /* 5. THE $80 RECORD — the exact production shape, repaired          */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    // Reproduce production as read on 2026-09-10: a succeeded payment row
    // written by the old two-statement path, and a registration left pending
    // because the second statement never landed.
    await db.exec(`
      insert into public.payments
        (id, registration_id, email, amount, currency, tournament_name,
         stripe_session_id, stripe_payment_intent_id, status, tournament_id, contact_id, created_at)
      values
        (${lit(PAYMENT_ID)}, ${lit(REG_ID)}, 'player@example.com', 80.00, 'usd', 'Community Cup - Fall 2026',
         'cs_live_the_known_record', 'pi_the_known_record', 'succeeded', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)},
         '2026-08-22T01:33:36.529904Z');
    `);
    const before = (await payments(db))[0];
    t.eq("fixture matches the production shape: succeeded payment, pending registration", [
      before.status,
      before.amount,
      (await registration(db))!.payment_status,
    ], ["succeeded", "80.00", "pending"]);
    t.eq("...and the created_at the production row carries", before.created_at.slice(0, 10), "2026-08-22");

    const repair = await finalize(db, {
      session_id: "cs_live_the_known_record",
      payment_intent_id: "pi_the_known_record",
    });
    t.eq(
      "reprocessing converges the registration WITHOUT a second payment row",
      [repair.outcome, repair.payment_inserted, repair.registration_updated, repair.payment_id],
      ["finalized", false, true, PAYMENT_ID]
    );
    t.eq("registration is now paid", (await registration(db))!.payment_status, "paid");
    t.eq("the ledger still has exactly one row", await count(db, "payments"), 1);

    const after = (await payments(db))[0];
    t.eq("the money was not rewritten: id, amount and created_at are untouched", [
      after.id,
      after.amount,
      after.created_at,
    ], [before.id, before.amount, before.created_at]);
    t.check("the repair did not flag the row for review", (await registration(db))!.needs_admin_review === false);

    const again = await finalize(db, {
      session_id: "cs_live_the_known_record",
      payment_intent_id: "pi_the_known_record",
    });
    t.eq("running the repair twice is a no-op", [again.registration_updated, again.payment_inserted], [false, false]);
    t.eq("still one payments row after the second repair", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 6. Delivery idempotency on the Stripe event id                    */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const first = await finalize(db, { event_id: "evt_1", event_type: "checkout.session.completed", session_id: "cs_evt", payment_intent_id: "pi_evt" });
    t.eq("first delivery finalizes", first.outcome, "finalized");

    const ledger = await db.row<{ outcome: string; processed_at: string | null; object_id: string }>(
      `select outcome, processed_at, object_id from public.stripe_webhook_events where id = 'evt_1'`
    );
    t.eq("the event is recorded processed, pointing at the session", [ledger?.outcome, ledger?.object_id, ledger?.processed_at !== null], [
      "finalized",
      "cs_evt",
      true,
    ]);

    // Undo the registration by hand, then replay: a replay must NOT re-apply.
    await db.exec(`update public.registrations set payment_status = 'pending' where id = ${lit(REG_ID)}`);
    const replay = await finalize(db, { event_id: "evt_1", event_type: "checkout.session.completed", session_id: "cs_evt", payment_intent_id: "pi_evt" });
    t.eq("replay of a processed event → duplicate_event with the previous outcome", [replay.outcome, replay.previous_outcome], [
      "duplicate_event",
      "finalized",
    ]);
    t.eq("a replay writes nothing at all", (await registration(db))!.payment_status, "pending");
    t.eq("still one payments row", await count(db, "payments"), 1);

    // A DIFFERENT event for the same session (completed → async_payment_succeeded)
    // must still converge: business identity is the session, not the event.
    const second = await finalize(db, { event_id: "evt_2", event_type: "checkout.session.async_payment_succeeded", session_id: "cs_evt", payment_intent_id: "pi_evt" });
    t.eq(
      "a second event id for the same session converges the registration, no new payment",
      [second.outcome, second.payment_inserted, second.registration_updated],
      ["finalized", false, true]
    );
    t.eq("two event rows, one payment row", [await count(db, "stripe_webhook_events"), await count(db, "payments")], [2, 1]);
  }

  /* ---------------------------------------------------------------- */
  /* 7. Owner decisions are never overwritten                          */
  /* ---------------------------------------------------------------- */
  {
    for (const status of ["waived", "refunded"] as const) {
      await seed(db);
      await db.exec(`update public.registrations set payment_status = ${lit(status)} where id = ${lit(REG_ID)}`);
      const res = await finalize(db, { session_id: `cs_${status}`, payment_intent_id: `pi_${status}` });
      const reg = await registration(db);
      t.eq(`money arriving for a '${status}' registration does not flip it`, reg!.payment_status, status);
      t.check(`'${status}' is flagged for review instead`, reg!.needs_admin_review === true);
      t.check(
        `'${status}' gets a note naming the situation`,
        (reg!.notes ?? "").includes(`marked ${status}`),
        `notes: ${reg!.notes}`
      );
      t.eq(`the money is still recorded for '${status}'`, await count(db, "payments"), 1);
      t.eq(`outcome for '${status}' is still 'finalized' (the payment settled)`, res.outcome, "finalized");
    }
  }

  {
    await seed(db);
    await db.exec(`update public.registrations set cancelled_at = now() where id = ${lit(REG_ID)}`);
    const res = await finalize(db, { session_id: "cs_cancelled", payment_intent_id: "pi_cancelled" });
    const reg = await registration(db);
    t.eq("a cancelled spot that gets paid is marked paid AND flagged", [res.registration_updated, reg!.payment_status, reg!.needs_admin_review], [
      true,
      "paid",
      true,
    ]);
    t.check(
      "the note asks for a refund decision",
      (reg!.notes ?? "").includes("refund decision needed"),
      `notes: ${reg!.notes}`
    );
    t.check("it is still cancelled — settlement does not un-cancel a spot", reg!.cancelled_at !== null);
  }

  /* ---------------------------------------------------------------- */
  /* 8. confirm=false records the money and flags, never confirms      */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const note = "Stripe session cs_bad: amount_mismatch: got 100, expected 8000";
    const res = await finalize(db, {
      session_id: "cs_bad",
      payment_intent_id: "pi_bad",
      amount_cents: 100,
      confirm: false,
      review_note: note,
    });
    const reg = await registration(db);
    t.eq("confirm=false → recorded_needs_review, registration NOT confirmed", [res.outcome, reg!.payment_status], [
      "recorded_needs_review",
      "pending",
    ]);
    t.check("the registration is flagged", reg!.needs_admin_review === true);
    t.eq("the reason is on the registration", reg!.notes, note);
    t.eq("the money is recorded anyway — it moved", await count(db, "payments"), 1);
    t.eq("the reason is on the payment row too", (await payments(db))[0].notes, note);

    // Convergence must not grow the note every time it runs.
    await finalize(db, { session_id: "cs_bad", payment_intent_id: "pi_bad", amount_cents: 100, confirm: false, review_note: note });
    await finalize(db, { session_id: "cs_bad", payment_intent_id: "pi_bad", amount_cents: 100, confirm: false, review_note: note });
    const reg3 = await registration(db);
    t.eq("repeating it does not repeat the note", reg3!.notes, note);
    t.eq("...nor on the payment row", (await payments(db))[0].notes, note);
  }

  /* ---------------------------------------------------------------- */
  /* 9. append_note_line in isolation                                  */
  /* ---------------------------------------------------------------- */
  {
    const cases: [string, string, string, string][] = [
      ["append to null", "null", "'first'", "first"],
      ["append to empty", "'   '", "'first'", "first"],
      ["append a second line", "'first'", "'second'", "first\nsecond"],
      ["do not repeat an identical line", "'first'", "'first'", "first"],
      ["ignore an empty line", "'first'", "'   '", "first"],
    ];
    for (const [name, existing, line, want] of cases) {
      const got = await db.scalar(`select public.append_note_line(${existing}, ${line})`);
      t.eq(`append_note_line: ${name}`, got, want);
    }
    const nullLine = await db.scalar(`select coalesce(public.append_note_line('first', null), '<null>')`);
    t.eq("append_note_line: a null line leaves the note alone", nullLine, "first");

    // Known and accepted: the dedupe is a substring test, so a line that is a
    // prefix of one already present is treated as already there. Pinned so the
    // behaviour is a decision rather than a surprise.
    const substring = await db.scalar(`select public.append_note_line('Paid in full by card', 'Paid in full')`);
    t.eq("append_note_line: substring dedupe is by design (documented limitation)", substring, "Paid in full by card");
  }

  /* ---------------------------------------------------------------- */
  /* 10. Ids that name rows which no longer exist                      */
  /* ---------------------------------------------------------------- */
  // `payments` has foreign keys to registrations, contacts and tournaments. The
  // function writes whatever ids the caller hands it, so an id naming a deleted
  // row raises 23503 and the whole settlement rolls back. Whether that is safe
  // depends entirely on where each id came from:
  //
  //   registration_id  the application re-reads the row and passes null when it
  //                    is gone, so only a delete racing the webhook can hit this
  //                    — and the retry then converges (the re-read finds nothing).
  //   drop_in_id       likewise re-read.
  //   contact_id       taken STRAIGHT FROM STRIPE METADATA when present, never
  //   tournament_id    re-read. Metadata is frozen at checkout; if the row it
  //                    names has since been deleted, every retry fails the same
  //                    way for ever. That is a payment that can never be recorded.
  //
  // These assertions pin the mechanism. The guard added for it lives in
  // supabase/migrations/20260910120000_finalize_link_tolerance_and_lock_order.sql.
  {
    const ghost = "99999999-9999-4999-8999-999999999999";

    // First: the foreign keys are genuinely present in this fixture, so the
    // tolerance below is doing real work rather than passing on a schema that
    // never had the constraint.
    await seed(db);
    const rawInsert = await tryStatement(
      db,
      `insert into public.payments (email, amount, status, registration_id)
       values ('a@b.c', 1, 'succeeded', ${lit(ghost)})`
    );
    t.eq("payments really does have a foreign key to registrations (23503)", [rawInsert.ok, rawInsert.sqlstate], [false, "23503"]);

    await seed(db);
    const badReg = await finalize(db, { session_id: "cs_ghost_reg", payment_intent_id: "pi_ghost_reg", registration_id: ghost });
    t.eq(
      "a registration that no longer exists → the money is recorded, unlinked, flagged",
      [badReg.outcome, badReg.registration_updated],
      ["recorded_needs_review", false]
    );
    t.eq("the payment survived", await count(db, "payments"), 1);
    t.eq("with the dead link dropped", (await payments(db))[0].registration_id, null);
    t.check(
      "and a note naming what was lost",
      ((await payments(db))[0].notes ?? "").includes(`registration ${ghost}`),
      `notes: ${(await payments(db))[0].notes}`
    );

    await seed(db);
    const badContact = await finalize(db, { session_id: "cs_ghost_contact", payment_intent_id: "pi_ghost_contact", contact_id: ghost });
    t.eq(
      "a merged-away contact does NOT withdraw confirmation — the player still paid",
      [badContact.outcome, badContact.registration_updated],
      ["finalized", true]
    );
    t.eq("the registration is paid", (await registration(db))!.payment_status, "paid");
    t.eq("the payment kept the money and dropped the contact link", [await count(db, "payments"), (await payments(db))[0].contact_id], [
      1,
      null,
    ]);

    await seed(db);
    const badTournament = await finalize(db, {
      session_id: "cs_ghost_event",
      payment_intent_id: "pi_ghost_event",
      registration_id: null,
      tournament_id: ghost,
    });
    t.eq("an event that no longer exists → recorded and flagged, not lost", [badTournament.outcome, await count(db, "payments")], [
      "recorded_needs_review",
      1,
    ]);
    t.eq("the dead event link is dropped", (await payments(db))[0].tournament_id, null);

    await seed(db);
    const badDropIn = await finalize(db, {
      session_id: "cs_ghost_dropin",
      payment_intent_id: "pi_ghost_dropin",
      registration_id: null,
      drop_in_id: ghost,
      amount_cents: 1500,
    });
    t.eq("a deleted drop-in → recorded and flagged", [badDropIn.outcome, badDropIn.drop_in_updated, await count(db, "payments")], [
      "recorded_needs_review",
      false,
      1,
    ]);

    // The retry that used to loop for three days now converges the first time.
    await seed(db);
    const args1 = { session_id: "cs_ghost_retry", payment_intent_id: "pi_ghost_retry", contact_id: ghost };
    await finalize(db, { ...args1, event_id: "evt_ghost_1", event_type: "checkout.session.completed" });
    const retry = await finalize(db, { ...args1, event_id: "evt_ghost_2", event_type: "checkout.session.completed" });
    t.eq("a redelivery of the same stale session is a no-op, not a second failure", retry.payment_inserted, false);
    t.eq("one payments row", await count(db, "payments"), 1);
  }

  /* ---------------------------------------------------------------- */
  /* 11. Drop-ins                                                      */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const res = await finalize(db, {
      session_id: "cs_drop",
      payment_intent_id: "pi_drop",
      registration_id: null,
      drop_in_id: DROP_IN_ID,
      amount_cents: 1500,
      contact_id: OTHER_CONTACT_ID,
    });
    t.eq("a drop-in settles", [res.outcome, res.drop_in_updated], ["finalized", true]);
    t.eq("the drop-in is paid", await db.scalar(`select payment_status from public.drop_ins where id = ${lit(DROP_IN_ID)}`), "paid");

    const again = await finalize(db, {
      session_id: "cs_drop",
      payment_intent_id: "pi_drop",
      registration_id: null,
      drop_in_id: DROP_IN_ID,
      amount_cents: 1500,
      contact_id: OTHER_CONTACT_ID,
    });
    t.eq("settling a paid drop-in again changes nothing", again.drop_in_updated, false);
  }

  /* ---------------------------------------------------------------- */
  /* 12. One payment per PaymentIntent — and nothing half-written      */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await finalize(db, { session_id: "cs_one", payment_intent_id: "pi_shared" });
    t.eq("first session recorded", await count(db, "payments"), 1);
    await db.exec(`update public.registrations set payment_status = 'pending', needs_admin_review = false where id = ${lit(REG_ID)}`);

    const clash = await tryFinalize(db, { session_id: "cs_two", payment_intent_id: "pi_shared" });
    t.eq("a second session sharing one PaymentIntent raises 23505", [clash.ok, clash.sqlstate], [false, "23505"]);
    t.eq("no second ledger row was written", await count(db, "payments"), 1);
    t.eq(
      "and the registration was NOT touched — the whole call rolled back",
      (await registration(db))!.payment_status,
      "pending"
    );
  }

  /* ---------------------------------------------------------------- */
  /* 13. Rollback leaves no processed event behind                     */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await finalize(db, { session_id: "cs_a", payment_intent_id: "pi_dup" });
    // This delivery will fail on the PaymentIntent index. Its event row must not
    // survive as processed, or Stripe's retry would be answered 'duplicate_event'
    // and the payment would be lost.
    const failed = await tryFinalize(db, {
      event_id: "evt_rollback",
      event_type: "checkout.session.completed",
      session_id: "cs_b",
      payment_intent_id: "pi_dup",
    });
    t.eq("the failing delivery raised", failed.ok, false);
    t.eq(
      "its event row did not survive the rollback, so a retry starts clean",
      await count(db, "stripe_webhook_events", `id = 'evt_rollback'`),
      0
    );
  }

  /* ---------------------------------------------------------------- */
  /* 14. Concurrency — two deliveries of the SAME event                */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const payload = jsonLit(args({ event_id: "evt_race", event_type: "checkout.session.completed", session_id: "cs_race", payment_intent_id: "pi_race" }));
    const slow = db.concurrent(`select public.finalize_checkout_payment(p => ${payload}); select pg_sleep(1.5);`);
    await new Promise((r) => setTimeout(r, 400));
    const fast = db.concurrent(`select public.finalize_checkout_payment(p => ${payload});`);
    const [a, b] = await Promise.all([slow, fast]);

    t.check("both deliveries returned without error", a.ok && b.ok, `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    const outcomes = [a, b].map((r) => (r.ok ? r.out : "")).join(" ");
    t.check(
      "exactly one settled; the other saw duplicate_event",
      (outcomes.match(/"outcome" *: *"finalized"/g) ?? []).length === 1 &&
        (outcomes.match(/duplicate_event/g) ?? []).length === 1,
      outcomes
    );
    t.eq("one payments row survived the race", await count(db, "payments"), 1);
    t.eq("one event row", await count(db, "stripe_webhook_events"), 1);
    t.eq("registration paid once", (await registration(db))!.payment_status, "paid");
  }

  /* ---------------------------------------------------------------- */
  /* 15. Concurrency — two DIFFERENT events for the same session       */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const one = jsonLit(args({ event_id: "evt_x", event_type: "checkout.session.completed", session_id: "cs_shared", payment_intent_id: "pi_shared2" }));
    const two = jsonLit(args({ event_id: "evt_y", event_type: "checkout.session.async_payment_succeeded", session_id: "cs_shared", payment_intent_id: "pi_shared2" }));
    const slow = db.concurrent(`select public.finalize_checkout_payment(p => ${one}); select pg_sleep(1.2);`);
    await new Promise((r) => setTimeout(r, 300));
    const fast = db.concurrent(`select public.finalize_checkout_payment(p => ${two});`);
    const [a, b] = await Promise.all([slow, fast]);

    t.check(
      "the webhook and the success page racing on one session both succeed",
      a.ok && b.ok,
      `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`
    );
    t.eq("and leave exactly one payments row", await count(db, "payments"), 1);
    t.eq("registration paid", (await registration(db))!.payment_status, "paid");
  }

  /* ---------------------------------------------------------------- */
  /* 15b. Concurrency — two payments for ONE registration              */
  /* ---------------------------------------------------------------- */
  // The lock-upgrade deadlock: the payments insert takes FOR KEY SHARE on the
  // registration through the foreign key, and asking the same row for FOR
  // UPDATE afterwards is an upgrade that two concurrent settlements deadlock
  // on. Before the lock-order fix this raised 40P01 on roughly one pair in
  // twelve. Production already holds two registrations with two succeeded
  // payments each, so this is not hypothetical.
  {
    await seed(db);
    let deadlocks = 0;
    const ROUNDS = 10;
    for (let i = 0; i < ROUNDS; i++) {
      await db.exec(`delete from public.payments`);
      const one = jsonLit(args({ session_id: `cs_pair_a${i}`, payment_intent_id: `pi_pair_a${i}` }));
      const two = jsonLit(args({ session_id: `cs_pair_b${i}`, payment_intent_id: `pi_pair_b${i}` }));
      const [a, b] = await Promise.all([
        db.concurrent(`select public.finalize_checkout_payment(p => ${one});`),
        db.concurrent(`select public.finalize_checkout_payment(p => ${two});`),
      ]);
      for (const r of [a, b]) if (!r.ok && /deadlock/i.test(r.error)) deadlocks += 1;
    }
    t.eq(`two payments for one registration never deadlock (${ROUNDS} concurrent pairs)`, deadlocks, 0);
    t.eq("both settled: two ledger rows for the two sessions", await count(db, "payments"), 2);
    t.eq("the registration is paid once", (await registration(db))!.payment_status, "paid");
  }

  /* ---------------------------------------------------------------- */
  /* 16. The roster invariant                                          */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const before = await count(db, "registrations");
    await finalize(db, { session_id: "cs_roster", payment_intent_id: "pi_roster" });
    t.eq("settlement never inserts a registration", await count(db, "registrations"), before);

    const dup = await tryStatement(
      db,
      `insert into public.registrations
         (registration_type, first_name, last_name, email, phone, dob, emergency_name, emergency_phone,
          waiver_type, tournament_id, contact_id)
       values ('adult','Test','Player','player@example.com','555','1990-01-01','ICE','555',
               'adult', ${lit(EVENT_ID)}, ${lit(CONTACT_ID)})`
    );
    t.eq(
      "the one-live-spot index is real in this fixture: a second live spot is refused with 23505",
      [dup.ok, dup.sqlstate],
      [false, "23505"]
    );
  }

  /* ---------------------------------------------------------------- */
  /* 17. Amounts                                                       */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await finalize(db, { session_id: "cs_one_cent", payment_intent_id: "pi_one_cent", amount_cents: 1, confirm: false });
    t.eq("1 cent → 0.01", (await payments(db))[0].amount, "0.01");

    await seed(db);
    await finalize(db, { session_id: "cs_free", payment_intent_id: "pi_free", amount_cents: 0, confirm: false });
    t.eq("0 cents is accepted and stored as 0.00", (await payments(db))[0].amount, "0.00");

    await seed(db);
    const huge = await tryFinalize(db, {
      session_id: "cs_huge",
      payment_intent_id: "pi_huge",
      amount_cents: 10_000_000_000,
      confirm: false,
    });
    t.eq(
      "an amount that overflows numeric(10,2) raises 22003 rather than being silently stored",
      [huge.ok, huge.sqlstate],
      [false, "22003"]
    );
    t.eq("nothing was written", await count(db, "payments"), 0);
  }

  {
    await seed(db);
    await finalize(db, { session_id: "cs_upper", payment_intent_id: "pi_upper", currency: "USD", confirm: false });
    t.eq("currency is lower-cased on the way in", (await payments(db))[0].currency, "usd");

    await seed(db);
    await db.json(
      `public.finalize_checkout_payment(p => ${jsonLit({ session_id: "cs_nocur", email: "a@b.c", amount_cents: 1, confirm: false })})`
    );
    t.eq("an absent currency defaults to usd", (await payments(db))[0].currency, "usd");
  }

  /* ---------------------------------------------------------------- */
  /* 18. World Cup extras: team name and the notes line                */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await finalize(db, {
      session_id: "cs_wc",
      payment_intent_id: "pi_wc",
      team_name: "3rd Ward FC",
      notes_line: "World Cup: paid roster share (10 players).",
    });
    const reg = await registration(db);
    t.eq("the team name captured at checkout lands on the row", reg!.team_name, "3rd Ward FC");
    t.eq("so does the share note", reg!.notes, "World Cup: paid roster share (10 players).");

    await db.exec(`update public.registrations set payment_status = 'pending' where id = ${lit(REG_ID)}`);
    await finalize(db, { session_id: "cs_wc", payment_intent_id: "pi_wc", team_name: null, notes_line: "World Cup: paid roster share (10 players)." });
    t.eq("a later call with no team name does not erase the one on the row", (await registration(db))!.team_name, "3rd Ward FC");
    t.eq("and does not duplicate the note", (await registration(db))!.notes, "World Cup: paid roster share (10 players).");
  }

  /* ---------------------------------------------------------------- */
  /* 19. record_stripe_webhook_event                                   */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    await db.json(
      `public.record_stripe_webhook_event(p_event_id => 'evt_note', p_type => 'checkout.session.completed',
                                          p_object_id => 'cs_note', p_outcome => 'not_paid', p_detail => 'payment_status=unpaid')`
    );
    const row = await db.row<{ outcome: string; detail: string; processed_at: string | null }>(
      `select outcome, detail, processed_at from public.stripe_webhook_events where id = 'evt_note'`
    );
    t.eq("a non-settling event is recorded processed", [row?.outcome, row?.detail, row?.processed_at !== null], [
      "not_paid",
      "payment_status=unpaid",
      true,
    ]);

    await db.json(
      `public.record_stripe_webhook_event(p_event_id => 'evt_note', p_type => 'checkout.session.completed',
                                          p_object_id => 'cs_note', p_outcome => 'something_else', p_detail => 'later')`
    );
    const after = await db.row<{ outcome: string; detail: string }>(
      `select outcome, detail from public.stripe_webhook_events where id = 'evt_note'`
    );
    t.eq("re-recording keeps the first verdict", [after?.outcome, after?.detail], ["not_paid", "payment_status=unpaid"]);

    const noId = await db.json<TryResult>(
      `public.__test_try('select public.record_stripe_webhook_event(null, ''t'', null, ''o'', null)')`
    );
    t.eq("a null event id is refused", [noId.ok, noId.sqlstate], [false, "22023"]);
  }

  /* ---------------------------------------------------------------- */
  /* 20. Who may call this, and RLS                                    */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const asAnon = await tryStatement(
      db,
      `set local role anon; select public.finalize_checkout_payment('{"session_id":"cs_anon","email":"a@b.c","amount_cents":1}'::jsonb)`
    );
    t.eq("anon cannot execute the settlement function (42501)", [asAnon.ok, asAnon.sqlstate], [false, "42501"]);
    t.eq("...and nothing was written by the attempt", await count(db, "payments"), 0);

    // append_note_line shipped without a revoke block and so kept EXECUTE to
    // PUBLIC while its two siblings were service_role-only.
    const noteAsAnon = await tryStatement(db, `set local role anon; select public.append_note_line('a', 'b')`);
    t.eq("append_note_line is service_role-only too, not PUBLIC", [noteAsAnon.ok, noteAsAnon.sqlstate], [false, "42501"]);
    t.eq(
      "and service_role can still call it (finalize is SECURITY INVOKER)",
      await asRole(db, "service_role", `select public.append_note_line(null, 'kept')`),
      "kept"
    );

    await finalize(db, { session_id: "cs_rls", payment_intent_id: "pi_rls", confirm: false });
    t.eq(
      "RLS hides every payments row from anon even though the table grant exists",
      await asRole(db, "anon", "select count(*) from public.payments"),
      "0"
    );
    t.eq(
      "service_role sees the ledger (bypassrls, as in Supabase)",
      await asRole(db, "service_role", "select count(*) from public.payments"),
      "1"
    );
  }

  /* ---------------------------------------------------------------- */
  /* 20b. The production role path: authenticator → SET ROLE service_role */
  /* ---------------------------------------------------------------- */
  // PostgREST logs in as `authenticator` and issues SET ROLE. SET ROLE does not
  // re-apply role settings, so the session keeps authenticator's timeouts —
  // which is why the tests above, run as a superuser, are not by themselves
  // evidence about production's locking rules.
  {
    await seed(db);
    t.check("an authenticator login is available to test the production path", db.postgrestDsn !== null);

    const timeouts = await db.viaPostgrest(`select current_setting('statement_timeout') || '/' || current_setting('lock_timeout')`);
    t.eq(
      "the settlement session carries production's 8s statement and lock timeouts",
      timeouts.ok ? timeouts.out : timeouts.error,
      "8s/8s"
    );

    const settled = await db.viaPostgrest(
      `select public.finalize_checkout_payment(p => ${jsonLit(args({ session_id: "cs_pgrst", payment_intent_id: "pi_pgrst" }))})`
    );
    t.check(
      "a settlement runs end to end through the role path production uses",
      settled.ok && settled.out.includes('"finalized"'),
      settled.ok ? settled.out : settled.error
    );
    t.eq("and it wrote the ledger row", await count(db, "payments"), 1);
    t.eq("and confirmed the registration", (await registration(db))!.payment_status, "paid");

    const sees = await db.viaPostgrest(`select count(*) from public.payments`);
    t.eq("service_role reads the ledger through RLS by bypassing it", sees.ok ? sees.out : sees.error, "1");
  }

  /* ---------------------------------------------------------------- */
  /* 21. A hostile search_path cannot redirect the function            */
  /* ---------------------------------------------------------------- */
  {
    await seed(db);
    const payload = jsonLit(args({ session_id: "cs_path", payment_intent_id: "pi_path" }));
    const res = await db.concurrent(
      `begin; set local search_path = pg_catalog; select public.finalize_checkout_payment(p => ${payload}); commit;`
    );
    t.check("`set search_path = public` on the function survives a hostile session search_path", res.ok, res.ok ? "" : res.error);
    t.eq("and it wrote to the real table", await count(db, "payments"), 1);
  }

  t.done();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
