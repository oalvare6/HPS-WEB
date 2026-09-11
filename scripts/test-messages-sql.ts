/**
 * Message batches and send-exactly-once, EXECUTED (Stage 2.3 item B).
 *
 *   npx tsx scripts/test-messages-sql.ts
 *
 * The hard part of sending is not sending. It is sending exactly once: the owner
 * runs events from a phone at the side of a pitch, and a double-tap that mails
 * forty people twice is unrecoverable, because mail cannot be recalled. Three
 * guarantees make that safe, all of them in SQL and therefore only provable by
 * running SQL:
 *
 *   1. A repeated idempotency key returns the FIRST batch and queues nothing.
 *   2. One address gets one row per batch, whatever the caller passes.
 *   3. A row already 'sent' is never re-sent, so retry only touches failures.
 *
 * Needs a PostgreSQL (see scripts/_pg.ts); it fails rather than skips without
 * one. HPS_SKIP_PG_TESTS=1 skips deliberately.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Harness } from "./_test-fakes";
import { jsonLit, lit, provisionEmptyDatabase, REPO_ROOT, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const PREAMBLE = join(REPO_ROOT, "scripts", "sql", "local-supabase-preamble.sql");

const EVENT = "aaaaaaaa-1111-4000-8000-000000000001";
const REG_A = "dddddddd-1111-4000-8000-00000000000a";
const REG_B = "dddddddd-1111-4000-8000-00000000000b";

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
    insert into public.tournaments (id, title, slug) values (${lit(EVENT)}, 'Message Test', 'message-test');
    insert into public.registrations
      (id, registration_type, first_name, last_name, email, phone, dob,
       emergency_name, emergency_phone, waiver_type, payment_status, tournament_id)
    values
      (${lit(REG_A)}, 'adult','Ann','Adams','ann@example.com','555-0101','1990-01-01','E','555-0201','adult','pending', ${lit(EVENT)}),
      (${lit(REG_B)}, 'adult','Ben','Brown','ben@example.com','555-0102','1990-01-01','E','555-0202','adult','paid', ${lit(EVENT)});
  `);
}

const batch = (p: Record<string, unknown>) =>
  `select public.record_message_batch(${jsonLit(p)}::jsonb)`;
const mark = (p: Record<string, unknown>) =>
  `select public.mark_message_sent(${jsonLit(p)}::jsonb)`;

async function errorOf(db: PgDb, sql: string): Promise<string | null> {
  const res = await db.applySql(sql);
  return res.ok ? null : (res as { error: string }).error;
}

const RECIPIENTS = [
  { registration_id: REG_A, email: "ann@example.com", name: "Ann Adams" },
  { registration_id: REG_B, email: "ben@example.com", name: "Ben Brown" },
];

async function main(): Promise<void> {
  if (skipRequested()) {
    console.log("HPS_SKIP_PG_TESTS=1: the messaging SQL was NOT executed. Nothing here is proved.");
    process.exit(0);
  }

  const { db, note } = await provisionEmptyDatabase("hps_messages_test");
  console.log(`# ${note}\n`);

  await buildSchema(db);
  await seed(db);

  const base = {
    idempotency_key: "compose-001",
    tournament_id: EVENT,
    template: "payment",
    audience: "unpaid",
    subject: "A reminder",
    body: "Hi {{first_name}}, you owe money for {{event}}.",
    created_by: "Omar",
    recipients: RECIPIENTS,
  };

  const first = await db.json<{ batch_id: string; created: boolean; queued: number }>(batch(base));
  t.check("a new send creates a batch", first.created === true);
  t.eq("and queues one row per recipient", first.queued, 2);

  /* 1. The double tap. */
  const repeat = await db.json<{ batch_id: string; created: boolean; queued: number }>(batch(base));
  t.eq("re-posting the same idempotency key returns the FIRST batch", repeat.batch_id, first.batch_id);
  t.check("and reports it was not created again", repeat.created === false);
  t.eq("and queues nobody a second time", repeat.queued, 0);
  t.eq(
    "so the batch still has exactly two recipients",
    Number(await db.scalar(`select count(*) from public.message_recipients where batch_id = ${lit(first.batch_id)}`)),
    2
  );
  t.eq(
    "and exactly one batch exists",
    Number(await db.scalar("select count(*) from public.message_batches")),
    1
  );

  /* 2. One address, one row — even if the caller repeats it. */
  const dupes = await db.json<{ batch_id: string; queued: number }>(
    batch({
      ...base,
      idempotency_key: "compose-002",
      recipients: [
        { registration_id: REG_A, email: "ann@example.com", name: "Ann Adams" },
        { registration_id: REG_B, email: "ANN@example.com", name: "Ann again" },
      ],
    })
  );
  t.eq("a repeated address is queued once, not twice", dupes.queued, 1);

  /* 3. Send exactly once. */
  const rows = await db.rows<{ id: string; email: string }>(
    `select id, email from public.message_recipients where batch_id = ${lit(first.batch_id)} order by email`
  );
  t.eq("two rows to send", rows.length, 2);

  const sent = await db.json<{ already_sent: boolean; status: string }>(
    mark({ id: rows[0].id, status: "sent", provider_id: "resend_abc123" })
  );
  t.check("marking a queued row sent works", sent.already_sent === false && sent.status === "sent");

  const resent = await db.json<{ already_sent: boolean }>(
    mark({ id: rows[0].id, status: "sent", provider_id: "resend_SECOND" })
  );
  t.check("marking it sent AGAIN reports already_sent and changes nothing", resent.already_sent === true);
  t.eq(
    "the provider id of the first send is kept",
    await db.scalar(`select provider_id from public.message_recipients where id = ${lit(rows[0].id)}`),
    "resend_abc123"
  );
  t.eq(
    "and the attempt count did not grow on the no-op",
    Number(await db.scalar(`select attempts from public.message_recipients where id = ${lit(rows[0].id)}`)),
    1
  );

  // A failure, then a retry that succeeds — the shape a real retry takes.
  await db.exec(mark({ id: rows[1].id, status: "failed", error: "resend_422_invalid" }));
  t.eq(
    "a failure records its reason",
    await db.scalar(`select error from public.message_recipients where id = ${lit(rows[1].id)}`),
    "resend_422_invalid"
  );
  await db.exec(mark({ id: rows[1].id, status: "sent", provider_id: "resend_retry" }));
  t.eq(
    "a retry clears the error once it succeeds",
    await db.scalar(`select error from public.message_recipients where id = ${lit(rows[1].id)}`),
    null
  );
  t.eq(
    "and counts as a second attempt",
    Number(await db.scalar(`select attempts from public.message_recipients where id = ${lit(rows[1].id)}`)),
    2
  );

  /* What a retry would pick up: failed and queued only, never sent. */
  t.eq(
    "nothing in this batch is left to retry once all are sent",
    Number(
      await db.scalar(
        `select count(*) from public.message_recipients
          where batch_id = ${lit(first.batch_id)} and status in ('queued','failed')`
      )
    ),
    0
  );

  /* Validation. */
  for (const [name, payload, fragment] of [
    ["a missing idempotency key", { idempotency_key: "" }, "idempotency_key is required"],
    ["an empty subject", { idempotency_key: "v1", subject: "  " }, "subject and a body"],
    ["an empty body", { idempotency_key: "v2", body: "  " }, "subject and a body"],
    ["a missing sender", { idempotency_key: "v3", created_by: " " }, "created_by is required"],
    ["no recipients at all", { idempotency_key: "v4", recipients: [] }, "at least one recipient"],
    [
      "recipients with no email address",
      { idempotency_key: "v5", recipients: [{ registration_id: REG_A, email: "  " }] },
      "at least one recipient",
    ],
  ] as Array<[string, Record<string, unknown>, string]>) {
    const err = await errorOf(db, batch({ ...base, ...payload }));
    t.check(`${name} is refused`, err !== null && err.includes(fragment), err ?? "accepted");
  }

  t.check(
    "an unknown status is refused",
    (await errorOf(db, mark({ id: rows[0].id, status: "delivered" })))?.includes("sent or failed") === true
  );

  /* The browser keys must never see who was messaged. */
  for (const table of ["message_batches", "message_recipients"]) {
    t.eq(
      `anon and authenticated hold no privilege on ${table}`,
      Number(
        await db.scalar(
          `select count(*) from information_schema.role_table_grants
            where table_schema = 'public' and table_name = ${lit(table)}
              and grantee in ('anon', 'authenticated')`
        )
      ),
      0
    );
    t.check(
      `RLS is enabled on ${table}`,
      (await db.scalar(`select relrowsecurity::text from pg_class where oid = ${lit(`public.${table}`)}::regclass`)) === "true"
    );
  }

  t.done();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
