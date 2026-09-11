/**
 * Offline payments and the cross-event team guard, EXECUTED (Stage 2.3 A + C).
 *
 *   npx tsx scripts/test-manual-payments-sql.ts
 *
 * Both features are enforced in SQL — `record_manual_payment`,
 * `void_manual_payment`, `apply_manual_payment_status` and the
 * `registrations_team_same_event` trigger — so a test that does not execute SQL
 * proves nothing about either. This builds the schema from empty exactly as
 * `test-migrations-from-empty.ts` does, then drives the functions.
 *
 * The case worth naming is `voiding walks the status back down`. The first draft
 * of `apply_manual_payment_status` returned early on any 'paid' status, meaning
 * to protect Stripe — but when a receipt itself brought the total up to the fee,
 * voiding that receipt hit the same guard and left the registration reading
 * 'paid' with $20 against a $50 entry. A void that does not move the status is
 * worse than no void at all, because the roster then states something false.
 *
 * Needs a PostgreSQL, like the other SQL suites (see scripts/_pg.ts); it fails
 * rather than skips without one. HPS_SKIP_PG_TESTS=1 skips deliberately.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Harness } from "./_test-fakes";
import { jsonLit, lit, provisionEmptyDatabase, REPO_ROOT, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const PREAMBLE = join(REPO_ROOT, "scripts", "sql", "local-supabase-preamble.sql");

const EVENT = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_EVENT = "aaaaaaaa-0000-4000-8000-000000000002";
const CONTACT = "bbbbbbbb-0000-4000-8000-000000000001";
const TEAM_HERE = "cccccccc-0000-4000-8000-000000000001";
const TEAM_THERE = "cccccccc-0000-4000-8000-000000000002";
const REG = "dddddddd-0000-4000-8000-000000000001";
const REG_CARD = "dddddddd-0000-4000-8000-000000000002";
const REG_WAIVED = "dddddddd-0000-4000-8000-000000000003";
const REG_OTHER_EVENT = "dddddddd-0000-4000-8000-000000000004";
const REG_CANCELLED = "dddddddd-0000-4000-8000-000000000005";

const FEE_CENTS = 5000;

async function buildSchema(db: PgDb): Promise<void> {
  await db.exec(
    "drop schema if exists public cascade; create schema public; " +
      "drop schema if exists supabase_migrations cascade; drop schema if exists storage cascade;"
  );
  const pre = await db.applyFile(PREAMBLE);
  t.check("the Supabase preamble applies", pre.ok, pre.ok ? "" : (pre as { error: string }).error);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let failed = "";
  for (const file of files) {
    const res = await db.applyFile(join(MIGRATIONS_DIR, file));
    if (!res.ok) {
      failed = `${file}: ${(res as { error: string }).error}`;
      break;
    }
  }
  t.check(`all ${files.length} migrations apply from empty`, failed === "", failed);
}

async function seed(db: PgDb): Promise<void> {
  await db.exec(`
    insert into public.tournaments (id, title, slug, entry_fee_cents)
    values (${lit(EVENT)}, 'Manual Payments Test', 'manual-payments-test', ${FEE_CENTS}),
           (${lit(OTHER_EVENT)}, 'Another Event', 'another-event', ${FEE_CENTS});

    insert into public.contacts (id, first_name, last_name, email)
    values (${lit(CONTACT)}, 'Test', 'Player', 'manual-payments@example.com');

    insert into public.teams (id, tournament_id, name)
    values (${lit(TEAM_HERE)}, ${lit(EVENT)}, 'Here'),
           (${lit(TEAM_THERE)}, ${lit(OTHER_EVENT)}, 'There');

    insert into public.registrations
      (id, registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, payment_status, tournament_id, contact_id)
    values
      (${lit(REG)}, 'adult','Test','Player','manual-payments@example.com','555-0100','1990-01-01',
       'E','555-0200','adult','pending', ${lit(EVENT)}, ${lit(CONTACT)}),
      (${lit(REG_CARD)}, 'adult','Card','Player','card@example.com','555-0101','1990-01-01',
       'E','555-0201','adult','paid', ${lit(EVENT)}, null),
      (${lit(REG_WAIVED)}, 'adult','Waived','Player','waived@example.com','555-0102','1990-01-01',
       'E','555-0202','adult','waived', ${lit(EVENT)}, null),
      (${lit(REG_OTHER_EVENT)}, 'adult','Other','Player','other@example.com','555-0103','1990-01-01',
       'E','555-0203','adult','pending', ${lit(OTHER_EVENT)}, null);

    -- A spot the player gave up before the money arrived (Stage 2.3 D).
    insert into public.registrations
      (id, registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, payment_status, tournament_id, contact_id, cancelled_at)
    values
      (${lit(REG_CANCELLED)}, 'adult','Gone','Player','gone@example.com','555-0104','1990-01-01',
       'E','555-0204','adult','pending', ${lit(EVENT)}, null, now() - interval '1 day');

    insert into public.payments (registration_id, email, amount, status, tournament_id)
    values (${lit(REG_CARD)}, 'card@example.com', 50.00, 'succeeded', ${lit(EVENT)});
  `);
}

const record = (p: Record<string, unknown>) =>
  `select public.record_manual_payment(${jsonLit(p)}::jsonb)`;
const voidReceipt = (p: Record<string, unknown>) =>
  `select public.void_manual_payment(${jsonLit(p)}::jsonb)`;

async function statusOf(db: PgDb, reg: string): Promise<string | null> {
  return db.scalar(`select payment_status from public.registrations where id = ${lit(reg)}`);
}

/** Run a statement and report the SQLSTATE it raised, or null if it succeeded. */
async function errorOf(db: PgDb, sql: string): Promise<string | null> {
  const res = await db.applySql(sql);
  return res.ok ? null : (res as { error: string }).error;
}

async function main(): Promise<void> {
  if (skipRequested()) {
    console.log("HPS_SKIP_PG_TESTS=1: the manual-payment SQL was NOT executed. Nothing here is proved.");
    process.exit(0);
  }

  const { db, note } = await provisionEmptyDatabase("hps_manual_payments_test");
  console.log(`# ${note}\n`);

  await buildSchema(db);
  await seed(db);

  /* ---------------- Stage 2.3 C: the cross-event team guard --------------- */

  t.check(
    "a team from another event is refused",
    (await errorOf(
      db,
      `update public.registrations set team_id = ${lit(TEAM_THERE)} where id = ${lit(REG)}`
    ))?.includes("different event") === true,
    "expected 'That team belongs to a different event.'"
  );

  t.check(
    "a team from the same event is accepted",
    (await errorOf(
      db,
      `update public.registrations set team_id = ${lit(TEAM_HERE)} where id = ${lit(REG)}`
    )) === null
  );

  t.check(
    "moving a rostered player to another event is refused",
    (await errorOf(
      db,
      `update public.registrations set tournament_id = ${lit(OTHER_EVENT)} where id = ${lit(REG)}`
    ))?.includes("different event") === true,
    "the trigger must fire on tournament_id too, not only team_id"
  );

  t.check(
    "clearing a team is always allowed",
    (await errorOf(db, `update public.registrations set team_id = null where id = ${lit(REG)}`)) === null
  );

  /* ---------------- Stage 2.3 A: offline receipts ------------------------- */

  const first = await db.json<{ payment_status: string; total_cents: number; id: string }>(
    record({
      registration_id: REG,
      amount_cents: 2000,
      method: "cash",
      received_at: "2026-09-11",
      recorded_by: "Omar at the field",
      note: "First instalment",
    })
  );
  t.eq("$20 against a $50 fee reads as partial", first.payment_status, "partial");
  t.eq("and the live total is $20", first.total_cents, 2000);

  const second = await db.json<{ payment_status: string; total_cents: number; id: string }>(
    record({
      registration_id: REG,
      amount_cents: 3000,
      method: "zelle",
      received_at: "2026-09-11",
      recorded_by: "Omar at the field",
    })
  );
  t.eq("the balance settles it", second.payment_status, "paid");
  t.eq("and the live total is the full fee", second.total_cents, 5000);

  // The regression this suite exists for.
  const voided = await db.json<{ payment_status: string; total_cents: number }>(
    voidReceipt({ id: second.id, voided_by: "Omar", reason: "Entered twice" })
  );
  t.eq("voiding walks the status BACK DOWN to partial", voided.payment_status, "partial");
  t.eq("and the live total drops again", voided.total_cents, 2000);

  const emptied = await db.json<{ payment_status: string; total_cents: number }>(
    voidReceipt({ id: first.id, voided_by: "Omar", reason: "Refunded" })
  );
  t.eq("voiding the last receipt returns it to pending", emptied.payment_status, "pending");

  t.eq(
    "voided receipts are kept, never deleted",
    Number(await db.scalar(`select count(*) from public.manual_payments where registration_id = ${lit(REG)}`)),
    2
  );

  const again = await db.json<{ already_voided: boolean }>(
    voidReceipt({ id: first.id, voided_by: "Omar" })
  );
  t.check("voiding twice is idempotent, not an error", again.already_voided === true);

  /* Stripe stays authoritative, and the owner's decisions stand. */

  const onCard = await db.json<{ payment_status: string; needs_review: boolean }>(
    record({
      registration_id: REG_CARD,
      amount_cents: 5000,
      method: "cash",
      received_at: "2026-09-11",
      recorded_by: "Front desk",
    })
  );
  t.eq("a Stripe-settled registration keeps its status", onCard.payment_status, "paid");
  t.check("and the collision is flagged for review", onCard.needs_review === true);
  // Stage 2.3 D reads this sentence back (src/lib/admin-review.ts): if the
  // wording here changes, the owner stops being told why.
  t.eq(
    "and the review says why, in the sentence the admin recognises",
    await db.scalar(
      `select notes from public.registrations where id = ${lit(REG_CARD)}`
    ),
    "Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment."
  );
  t.eq(
    "and the flag is set on the row",
    await db.scalar(`select needs_admin_review::text from public.registrations where id = ${lit(REG_CARD)}`),
    "true"
  );

  /* Money after a cancellation is a refund decision, not a status change (Stage 2.3 D). */

  const onCancelled = await db.json<{ payment_status: string; needs_review: boolean }>(
    record({
      registration_id: REG_CANCELLED,
      amount_cents: 5000,
      method: "zelle",
      received_at: "2026-09-11",
      recorded_by: "Front desk",
    })
  );
  t.check("a receipt on a cancelled spot is recorded and flagged", onCancelled.needs_review === true);
  t.eq(
    "and the review says the spot was already cancelled",
    await db.scalar(`select notes from public.registrations where id = ${lit(REG_CANCELLED)}`),
    "Offline payment recorded AFTER this spot was cancelled — refund decision needed."
  );
  t.check(
    "and the flag is set on the cancelled row too",
    (await db.scalar(`select needs_admin_review::text from public.registrations where id = ${lit(REG_CANCELLED)}`)) === "true"
  );
  t.check(
    "recording it twice does not say it twice (append_note_line dedupes)",
    (await (async () => {
      await db.json(record({ registration_id: REG_CANCELLED, amount_cents: 100, method: "cash", received_at: "2026-09-11", recorded_by: "Front desk" }));
      const notes = await db.scalar(`select notes from public.registrations where id = ${lit(REG_CANCELLED)}`);
      return (notes ?? "").split(/\r?\n/).filter((l) => l.includes("AFTER this spot was cancelled")).length === 1;
    })())
  );
  t.eq(
    "the money is still recorded — recording it outranks the collision",
    Number(
      await db.scalar(
        `select count(*) from public.manual_payments where registration_id = ${lit(REG_CARD)}`
      )
    ),
    1
  );

  const onWaived = await db.json<{ payment_status: string }>(
    record({
      registration_id: REG_WAIVED,
      amount_cents: 5000,
      method: "cash",
      received_at: "2026-09-11",
      recorded_by: "Front desk",
    })
  );
  t.eq("a waived spot keeps the owner's decision", onWaived.payment_status, "waived");

  t.eq(
    "a registration with no receipts is never touched by the recompute",
    await (async () => {
      await db.exec(`select public.apply_manual_payment_status(${lit(REG_OTHER_EVENT)})`);
      return statusOf(db, REG_OTHER_EVENT);
    })(),
    "pending"
  );

  /* Validation. Each of these is a message the owner could see. */

  for (const [name, payload, fragment] of [
    ["a zero amount", { amount_cents: 0 }, "greater than zero"],
    ["a negative amount", { amount_cents: -100 }, "greater than zero"],
    ["an unknown method", { method: "bitcoin" }, "cash, zelle or other"],
    ["a future date", { received_at: "2099-01-01" }, "future"],
    ["a blank recorded_by", { recorded_by: "  " }, "recorded_by is required"],
  ] as Array<[string, Record<string, unknown>, string]>) {
    const base = {
      registration_id: REG,
      amount_cents: 1000,
      method: "cash",
      received_at: "2026-09-11",
      recorded_by: "Someone",
    };
    const err = await errorOf(db, record({ ...base, ...payload }));
    t.check(`${name} is refused`, err !== null && err.includes(fragment), err ?? "accepted");
  }

  const unknown = await errorOf(
    db,
    record({
      registration_id: "eeeeeeee-0000-4000-8000-000000000009",
      amount_cents: 1000,
      method: "cash",
      received_at: "2026-09-11",
      recorded_by: "Someone",
    })
  );
  t.check(
    "an unknown registration is refused",
    unknown !== null && unknown.includes("does not exist"),
    unknown ?? "accepted"
  );

  /* The browser keys must never see offline money. */
  t.eq(
    "anon and authenticated hold no privilege on manual_payments",
    Number(
      await db.scalar(
        `select count(*) from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'manual_payments'
            and grantee in ('anon', 'authenticated')`
      )
    ),
    0
  );
  t.check(
    "RLS is enabled on manual_payments",
    (await db.scalar(
      `select relrowsecurity::text from pg_class where oid = 'public.manual_payments'::regclass`
    )) === "true"
  );

  t.done();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
