/**
 * The migration chain, EXECUTED from an empty database (Stage 1.6).
 *
 *   npx tsx scripts/test-migrations-from-empty.ts
 *
 * Every Supabase Preview branch of this project failed between 2026-05-13 and
 * 2026-09-10 with `relation "public.tournaments" does not exist`: four tables
 * the migrations depend on were only ever defined by loose scripts under
 * supabase/ and applied by hand. Production never noticed, because the tables
 * were already there. This file is the test that would have noticed.
 *
 * It provisions an EMPTY database, applies scripts/sql/local-supabase-preamble.sql
 * (the roles, default privileges and extension schema an empty Supabase
 * project already has), then applies every file in supabase/migrations/ in
 * name order, each in its own transaction — the way `supabase db push` and a
 * Preview branch apply them. Then it:
 *
 *   0. proves its own tripwire is armed on this server (see below);
 *   1. names the first file that fails, if any: the "first broken dependency";
 *   2. asserts every table and function the application reaches through
 *      `supabaseAdmin` exists, plus the invariants the docs promise (the two
 *      registrations→tournaments foreign keys, one live spot per person, one
 *      payment per Checkout Session, RLS on every table);
 *   3. applies the whole chain a SECOND time. Every file must be a no-op on a
 *      database that already has it — that is what makes it safe to record
 *      the files in production's drifted ledger later;
 *   4. runs scripts/sql/schema-catalog.sql on the result and compares it with
 *      docs/production-schema-catalog-2026-09-10.json, captured read-only from
 *      production. Every difference must be on the allow-list below with a
 *      reason, and every allow-list entry must still match something, so a
 *      difference that quietly disappears (or a new one) is reported.
 *
 * ## The exit code is not the whole story (2026-09-10, PR #9)
 *
 * The first version of this file went green on 44/44 while the Supabase Preview
 * branch for the same commit stopped dead at file 19 of 41:
 *
 *   ERROR: relation "public.league_round_overrides" does not exist (SQLSTATE 42P01)
 *   at 20260513121100_drop_legacy_overrides.sql:
 *     drop trigger if exists league_round_overrides_set_updated_at
 *       on public.league_round_overrides;
 *
 * Nothing was omitted here and no preamble hid it: the file set, the order and
 * the statement were all exactly what Supabase ran. The SERVERS disagreed.
 * `if exists` guards the trigger, never the relation named after `on`, and
 * PostgreSQL 17 (Supabase, verified 17.6 on the Preview branch itself) treats
 * the absent relation as 42P01, where PostgreSQL 16 — the version a developer
 * machine most often has, and the one this harness boots — downgrades it to
 * `NOTICE: relation "…" does not exist, skipping` and exits 0. A statement the
 * server SKIPPED was indistinguishable here from one it RAN, because the only
 * thing being asserted was psql's exit code.
 *
 * So this file now reads the notices as well, and treats that one shape as a
 * failure. Note which shape: `relation "X" does not exist, skipping` means the
 * PARENT relation was gone, and is the 42P01 class. The similar-looking
 * `trigger "T" for relation "R" does not exist, skipping` and `policy "P" for
 * relation "R" …` mean the opposite — the relation was there, only the child
 * object was absent — and are what an idempotent migration is supposed to say.
 *
 * Reading notices only helps on a server tolerant enough to emit them, so the
 * suite also proves the tripwire is armed before trusting it: it runs a
 * deliberately broken `drop trigger if exists … on <a relation that has never
 * existed>` and requires this server to either refuse it (as PostgreSQL 17
 * does) or announce the skip in a notice the detector recognises. A server
 * that does neither cannot see the failure a Preview branch sees, and the run
 * says so rather than passing.
 *
 * When a migration is added, this test changes in one of two ways: the new
 * objects show up as FRESH-ONLY until production has the migration and the
 * catalog is re-captured (run scripts/sql/schema-catalog.sql in the SQL editor
 * and replace the JSON), or — for a difference that is meant to stay — a line
 * is added to KNOWN_DIFFERENCES with the reason. Either way the change is
 * visible in the diff, which is the point.
 *
 * Needs a PostgreSQL, like the settlement tests (see scripts/_pg.ts); it fails
 * rather than skips without one. HPS_SKIP_PG_TESTS=1 skips deliberately and
 * says so.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Harness } from "./_test-fakes";
import { lit, provisionEmptyDatabase, REPO_ROOT, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const PREAMBLE = join(REPO_ROOT, "scripts", "sql", "local-supabase-preamble.sql");
const CATALOG_SQL = join(REPO_ROOT, "scripts", "sql", "schema-catalog.sql");
const PRODUCTION_CATALOG = join(REPO_ROOT, "docs", "production-schema-catalog-2026-09-10.json");
const DATABASE_NAME = "hps_migrations_test";

/** What Supabase runs. A local server on any other major is more forgiving in places. */
const SUPABASE_MAJOR = 17;

/* ------------------------------------------------------------------ */
/* The 42P01 class: a statement whose PARENT RELATION was missing      */
/* ------------------------------------------------------------------ */

/**
 * `NOTICE: relation "X" does not exist, skipping` — emitted by
 * `drop trigger|policy|rule … on <missing relation>` and by
 * `alter table if exists <missing relation>`. Every one of those is 42P01 on
 * PostgreSQL 17, so on a clean database each is a migration that will stop a
 * Supabase Preview branch.
 *
 * Deliberately anchored so it cannot match the shapes that prove the relation
 * WAS present — `trigger "T" for relation "R" does not exist, skipping`,
 * `policy "P" for relation "R" …` — nor the self-guarded ones that name their
 * own object: `table "T" …`, `index "I" …`, `function f() …`.
 */
const MISSING_RELATION = /^NOTICE:\s+relation "([^"]+)" does not exist, skipping/;

function missingRelations(notices: string[]): string[] {
  return notices.map((n) => MISSING_RELATION.exec(n)?.[1]).filter((r): r is string => r !== undefined);
}

/** A relation name no schema will ever hold, for arming the tripwire. */
const NEVER_EXISTED = "hps_tripwire_relation_that_never_existed";

/* ------------------------------------------------------------------ */
/* What the application needs to exist                                 */
/* ------------------------------------------------------------------ */

/** Every table `supabaseAdmin.from(...)` names in src/ and scripts/ (grep, 2026-09-10). */
const APP_TABLES = [
  "contacts",
  "drop_ins",
  "match_scorers",
  "matches",
  "payments",
  "registration_access_tokens",
  "registration_sessions",
  "registrations",
  "site_settings",
  "stripe_checkout_attempts",
  "team_members",
  "teams",
  "tournament_rounds",
  "tournament_updates",
  "tournaments",
  "waiver_signatures",
] as const;

/** Every function `supabaseAdmin.rpc(...)` names, plus the two written by RPC side effects. */
const APP_FUNCTIONS = [
  "clear_match_result",
  "consume_registration_access_token",
  "finalize_checkout_payment",
  "open_play_attendees",
  "record_resume_link_request",
  "record_stripe_webhook_event",
  "save_match_result",
] as const;

/* ------------------------------------------------------------------ */
/* Differences between a fresh build and production that are KNOWN     */
/* ------------------------------------------------------------------ */

type DiffKind = "production_only" | "fresh_only" | "changed";
type Section = keyof typeof KEY_OF;

type KnownDifference = { section: Section; key: string; kind: DiffKind; reason: string };

/**
 * Each entry is a difference the Stage 1.6 report accepts, with the reason.
 * Production's `matches`/`match_scorers` were created by hand in June 2026
 * from an earlier draft of the migration (branch
 * cursor/league-schedule-standings-scorers-9f16), and the migration that
 * followed used `create ... if not exists`, so production kept the draft's
 * index shapes and an orphan function. None of them changes a query result.
 */
/**
 * Objects this repository has and production does not yet, because their
 * migration has only reached the isolated development project. One reason for
 * the lot, since the reason really is the same one.
 */
function stage23FreshOnly(section: Section, keys: string[]): KnownDifference[] {
  return keys.map((key) => ({
    section,
    key,
    kind: "fresh_only" as DiffKind,
    reason:
      "Stage 2.3 (A: offline cash/Zelle receipts, C: the cross-event team guard). Created by supabase/migrations/20260911090000 and 20260911091000, applied to hps-dev only. Expected until production has them and the catalog is re-captured.",
  }));
}

const KNOWN_DIFFERENCES: KnownDifference[] = [
  {
    section: "constraints",
    key: "registrations.registrations_registration_type_check",
    kind: "changed",
    reason:
      "production still allows the legacy values 'team' and 'freeagent' (0 rows use them); the repo's baseline has always said ('adult','youth'). Narrowing production is a deliberate later change, recorded in the Stage 1.6 report.",
  },
  {
    section: "indexes",
    key: "matches.matches_home_team_idx",
    kind: "production_only",
    reason: "hand-created draft index (June 2026); no query filters matches by one team.",
  },
  {
    section: "indexes",
    key: "matches.matches_away_team_idx",
    kind: "production_only",
    reason: "hand-created draft index (June 2026); no query filters matches by one team.",
  },
  {
    section: "indexes",
    key: "matches.matches_round_idx",
    kind: "changed",
    reason: "production's copy is partial (WHERE round_id IS NOT NULL); the migration's is not. Same rows served.",
  },
  {
    section: "indexes",
    key: "match_scorers.match_scorers_match_idx",
    kind: "changed",
    reason: "production indexes (match_id) only; the migration adds sort_order. Same rows served.",
  },
  {
    section: "indexes",
    key: "match_scorers.match_scorers_team_idx",
    kind: "changed",
    reason: "production's copy is partial (WHERE team_id IS NOT NULL); the migration's is not. Same rows served.",
  },
  {
    section: "functions",
    key: "set_updated_at_match_scorers()",
    kind: "production_only",
    reason: "orphan from the hand-created draft; no trigger calls it (both match triggers use set_updated_at_matches).",
  },
  /*
    Stage 2.3 A + C. Everything below exists in this repository and not yet in
    production, because the two migrations that create it have only been applied
    to the isolated hps-dev project. This is the FRESH-ONLY case CLAUDE.md
    describes: expected until production has the migration and
    docs/production-schema-catalog-2026-09-10.json is re-captured, at which point
    these entries go stale and the check below will say so.
  */
  ...stage23FreshOnly("tables", ["manual_payments"]),
  ...stage23FreshOnly(
    "columns",
    [
      "amount_cents", "contact_id", "created_at", "currency", "id", "method",
      "note", "received_at", "recorded_by", "registration_id", "tournament_id",
      "void_reason", "voided_at", "voided_by",
    ].map((c) => `manual_payments.${c}`)
  ),
  ...stage23FreshOnly(
    "constraints",
    [
      "manual_payments_amount_cents_check", "manual_payments_contact_id_fkey",
      "manual_payments_method_check", "manual_payments_pkey",
      "manual_payments_recorded_by_check", "manual_payments_registration_id_fkey",
      "manual_payments_tournament_id_fkey", "manual_payments_void_is_complete",
    ].map((c) => `manual_payments.${c}`)
  ),
  ...stage23FreshOnly(
    "indexes",
    [
      "manual_payments_live_idx", "manual_payments_pkey",
      "manual_payments_registration_idx", "manual_payments_tournament_idx",
    ].map((i) => `manual_payments.${i}`)
  ),
  ...stage23FreshOnly("triggers", ["registrations.registrations_team_same_event"]),
  ...stage23FreshOnly("functions", [
    "apply_manual_payment_status(p_registration_id uuid)",
    "assert_registration_team_same_event()",
    "manual_payments_total_cents(p_registration_id uuid)",
    "record_manual_payment(p jsonb)",
    "void_manual_payment(p jsonb)",
  ]),
  ...stage23FreshOnly("table_grants", ["manual_payments.service_role"]),
  /* Stage 2.3 item B — message batches and per-recipient outcomes. */
  ...stage23FreshOnly("tables", ["message_batches", "message_recipients"]),
  ...stage23FreshOnly("columns", [
    ...["audience", "body", "created_at", "created_by", "id", "idempotency_key", "subject",
        "team_id", "template", "tournament_id"].map((c) => `message_batches.${c}`),
    ...["attempts", "batch_id", "contact_id", "email", "error", "id", "name", "provider_id",
        "registration_id", "sent_at", "status", "updated_at"].map((c) => `message_recipients.${c}`),
  ]),
  ...stage23FreshOnly("constraints", [
    ...["message_batches_body_check", "message_batches_created_by_check",
        "message_batches_idempotency_key", "message_batches_pkey",
        "message_batches_subject_check", "message_batches_team_id_fkey",
        "message_batches_tournament_id_fkey"].map((c) => `message_batches.${c}`),
    ...["message_recipients_attempts_check", "message_recipients_batch_id_fkey",
        "message_recipients_contact_id_fkey", "message_recipients_one_per_email",
        "message_recipients_pkey", "message_recipients_registration_id_fkey",
        "message_recipients_status_check"].map((c) => `message_recipients.${c}`),
  ]),
  ...stage23FreshOnly("indexes", [
    ...["message_batches_idempotency_key", "message_batches_pkey",
        "message_batches_tournament_idx"].map((i) => `message_batches.${i}`),
    ...["message_recipients_batch_idx", "message_recipients_one_per_email",
        "message_recipients_pkey", "message_recipients_registration_idx"].map(
      (i) => `message_recipients.${i}`
    ),
  ]),
  ...stage23FreshOnly("functions", ["mark_message_sent(p jsonb)", "record_message_batch(p jsonb)"]),
  ...stage23FreshOnly("table_grants", [
    "message_batches.service_role",
    "message_recipients.service_role",
  ]),
];

/* ------------------------------------------------------------------ */
/* Catalog comparison                                                  */
/* ------------------------------------------------------------------ */

type Item = Record<string, unknown>;
type Catalog = Record<string, Item[]>;

const KEY_OF = {
  tables: (x: Item) => `${x.table}`,
  columns: (x: Item) => `${x.table}.${x.column}`,
  constraints: (x: Item) => `${x.table}.${x.name}`,
  indexes: (x: Item) => `${x.table}.${x.name}`,
  policies: (x: Item) => `${x.schema}.${x.table}.${x.name}`,
  triggers: (x: Item) => `${x.table}.${x.name}`,
  functions: (x: Item) => `${x.name}(${x.args})`,
  table_grants: (x: Item) => `${x.table}.${x.grantee}`,
  column_grants: (x: Item) => `${x.table}.${x.column}.${x.grantee}`,
  extensions: (x: Item) => `${x.name}`,
  buckets: (x: Item) => `${x.id}`,
} as const;

type Difference = { section: Section; key: string; kind: DiffKind; detail: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function diffCatalogs(production: Catalog, fresh: Catalog): Difference[] {
  const out: Difference[] = [];
  for (const section of Object.keys(KEY_OF) as Section[]) {
    const keyOf = KEY_OF[section];
    const p = new Map((production[section] ?? []).map((i) => [keyOf(i), i]));
    const f = new Map((fresh[section] ?? []).map((i) => [keyOf(i), i]));
    for (const key of [...p.keys()].sort()) {
      if (!f.has(key)) out.push({ section, key, kind: "production_only", detail: canonical(p.get(key)) });
    }
    for (const key of [...f.keys()].sort()) {
      if (!p.has(key)) out.push({ section, key, kind: "fresh_only", detail: canonical(f.get(key)) });
    }
    for (const key of [...p.keys()].sort()) {
      const a = p.get(key)!;
      const b = f.get(key);
      if (!b || canonical(a) === canonical(b)) continue;
      const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((field) => canonical(a[field]) !== canonical(b[field]))
        .map((field) => `${field}: production=${canonical(a[field])} fresh=${canonical(b[field])}`);
      out.push({ section, key, kind: "changed", detail: fields.join("; ") });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const FILE_NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

function migrationFiles(): { file: string; version: string; name: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => {
      const m = FILE_NAME.exec(file);
      return { file, version: m?.[1] ?? "", name: m?.[2] ?? "" };
    });
}

async function recordInLedger(db: PgDb, version: string, name: string, sql: string) {
  // lit() rather than a dollar quote: the file text travels in psql's argv, and
  // on Windows anything non-ASCII in argv is mangled (see asciiStringLiteral).
  await db.exec(
    `insert into supabase_migrations.schema_migrations (version, statements, name)
     values ('${version}', array[${lit(sql)}], '${name}')
     on conflict (version) do nothing`
  );
}

async function count(db: PgDb, sql: string): Promise<number> {
  return Number((await db.scalar(sql)) ?? "0");
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  if (skipRequested()) {
    console.log("HPS_SKIP_PG_TESTS=1: the migration chain was NOT executed. Nothing here is proved.");
    process.exit(0);
  }

  const files = migrationFiles();
  const { db, note } = await provisionEmptyDatabase(DATABASE_NAME);
  console.log(`# migrations from empty — ${note}\n# ${files.length} files in supabase/migrations/\n`);

  if (Number(db.serverVersion.split(".")[0]) !== SUPABASE_MAJOR) {
    console.log(
      [
        `# NOTE: this ran on PostgreSQL ${db.serverVersion}; Supabase runs ${SUPABASE_MAJOR}.x.`,
        `#       The majors differ in how strictly they read a missing relation: 16 skips`,
        `#       \`drop trigger if exists … on <missing table>\` with a notice, 17 raises 42P01.`,
        `#       The tripwire below closes that one gap on either version. It is not a promise`,
        `#       that every other ${SUPABASE_MAJOR}↔${db.serverVersion.split(".")[0]} difference is covered — the Preview branch on the`,
        `#       pull request is still the last word.`,
        "",
      ].join("\n")
    );
  }

  /* ---------------------------------------------------------------- */
  /* 0. The starting point really is empty                             */
  /* ---------------------------------------------------------------- */
  {
    // A caller's own HPS_TEST_DATABASE_URL may hold leftovers; make the start
    // state unambiguous either way.
    await db.exec("drop schema if exists public cascade; create schema public; drop schema if exists supabase_migrations cascade; drop schema if exists storage cascade;");
    t.eq("no tables in public before the chain runs", await count(db, "select count(*) from pg_tables where schemaname = 'public'"), 0);

    const pre = await db.applyFile(PREAMBLE);
    t.check("the Supabase preamble applies (roles, default privileges, extensions schema, storage stub)", pre.ok, pre.ok ? "" : pre.error);
    t.eq("and still no tables in public", await count(db, "select count(*) from pg_tables where schemaname = 'public'"), 0);

    await db.exec(
      `create schema if not exists supabase_migrations;
       create table if not exists supabase_migrations.schema_migrations (
         version text primary key, statements text[], name text
       );`
    );
  }

  /* ---------------------------------------------------------------- */
  /* 0b. The tripwire is armed on THIS server                          */
  /* ---------------------------------------------------------------- */
  {
    // A migration that reaches for a relation which has never existed must not
    // be able to pass this suite quietly. PostgreSQL 17 refuses it outright;
    // PostgreSQL 16 skips it with a notice section 2 reads. If a server does
    // neither, the notice detector is blind and a green run means nothing —
    // so say that, loudly, instead of proceeding.
    const probe = await db.applySql(`drop trigger if exists hps_tripwire_trigger on public.${NEVER_EXISTED};`);
    const refused = !probe.ok;
    const announced = missingRelations(probe.notices).some((r) => r.includes(NEVER_EXISTED));
    t.check(
      "the tripwire is armed: this server either refuses `drop trigger if exists … on <a relation that never existed>` (PostgreSQL 17, what Supabase runs) or announces the skip in a notice this suite recognises (PostgreSQL 16)",
      refused || announced,
      `it did NEITHER — exit ok=${probe.ok}, notices=${JSON.stringify(probe.notices)}. ` +
        "On this server the suite CANNOT see the failure a Supabase Preview branch sees. Do not trust a green run."
    );
  }

  /* ---------------------------------------------------------------- */
  /* 1. File names are what the platform expects                       */
  /* ---------------------------------------------------------------- */
  {
    const bad = files.filter((f) => !f.version);
    t.check("every file is named <14-digit version>_<snake_name>.sql", bad.length === 0, bad.map((b) => b.file).join(", "));
    const versions = new Set(files.map((f) => f.version));
    t.eq("no two files share a version", versions.size, files.length);

    // Supabase orders by the 14-digit version; this suite reads the directory
    // and sorts by filename. They agree only while the version is the prefix —
    // so check it, rather than assume the two orders are the same list.
    t.eq(
      "filename order is the version order Supabase applies, so this suite runs the same set in the same sequence",
      files.map((f) => f.file),
      [...files].sort((a, b) => a.version.localeCompare(b.version)).map((f) => f.file)
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. The chain applies, in order, from nothing                      */
  /* ---------------------------------------------------------------- */
  let firstFailure: { file: string; error: string } | null = null;
  const reachedForNothing: string[] = [];
  for (const { file, version, name } of files) {
    const res = await db.applyFile(join(MIGRATIONS_DIR, file));
    for (const relation of missingRelations(res.notices)) reachedForNothing.push(`${file}: ${relation}`);
    if (!res.ok) {
      firstFailure = { file, error: res.error };
      break;
    }
    await recordInLedger(db, version, name, readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  t.check(
    `all ${files.length} migrations apply to an empty database in order`,
    firstFailure === null,
    firstFailure ? `FIRST BROKEN DEPENDENCY: ${firstFailure.file}\n        ${firstFailure.error.trim().split("\n").slice(-3).join("\n        ")}` : ""
  );
  // Exiting 0 is not the same as having run. On PostgreSQL 16 a statement whose
  // parent relation is absent is skipped with a notice and the file "succeeds";
  // on the PostgreSQL 17 Supabase runs the same statement is 42P01 and the
  // Preview branch stops there. Both servers agree this list must be empty.
  t.eq(
    "no migration reaches for a relation that does not exist on a clean database (`if exists` guards the child object, never the relation named after `on` — 42P01 on PostgreSQL 17)",
    reachedForNothing,
    []
  );
  if (firstFailure) {
    console.log("\nStopped at the first failure; nothing after it was attempted, exactly as a Preview branch would stop.");
    t.done();
  }
  t.eq("the ledger records every file", await count(db, "select count(*) from supabase_migrations.schema_migrations"), files.length);

  /* ---------------------------------------------------------------- */
  /* 3. Everything the application reaches exists                      */
  /* ---------------------------------------------------------------- */
  {
    const tables = new Set(
      (await db.rows<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'")).map((r) => r.tablename)
    );
    for (const table of APP_TABLES) t.check(`table ${table} exists`, tables.has(table));

    const functions = new Set(
      (await db.rows<{ proname: string }>("select proname from pg_proc where pronamespace = 'public'::regnamespace")).map((r) => r.proname)
    );
    for (const fn of APP_FUNCTIONS) t.check(`function ${fn} exists`, functions.has(fn));

    const rlsOff = await db.rows<{ relname: string }>(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity order by 1"
    );
    t.eq("RLS is enabled on every table in public", rlsOff.map((r) => r.relname), []);

    const fks = await db.rows<{ conname: string }>(
      `select conname from pg_constraint where conrelid = 'public.registrations'::regclass and contype = 'f'
         and confrelid = 'public.tournaments'::regclass order by 1`
    );
    t.eq(
      "both registrations→tournaments foreign keys exist under the names every embed must spell out (the PGRST201 trap)",
      fks.map((r) => r.conname),
      ["registrations_free_entry_tournament_id_fkey", "registrations_tournament_id_fkey"]
    );

    const liveSpot = await db.row<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'registrations_one_live_spot_idx'"
    );
    t.check(
      "one live spot per person per event is enforced by a partial UNIQUE index",
      !!liveSpot && /CREATE UNIQUE INDEX/.test(liveSpot.indexdef) && /cancelled_at IS NULL/.test(liveSpot.indexdef),
      liveSpot?.indexdef
    );

    const sessionKey = await db.scalar(
      "select contype from pg_constraint where conname = 'payments_stripe_session_id_key' and conrelid = 'public.payments'::regclass"
    );
    t.eq("one payments row per Checkout Session (UNIQUE stripe_session_id)", sessionKey, "u");

    const intentIdx = await db.row<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'payments_stripe_payment_intent_unique_idx'"
    );
    t.check(
      "one payment per PaymentIntent (partial UNIQUE index)",
      !!intentIdx && /CREATE UNIQUE INDEX/.test(intentIdx.indexdef) && /IS NOT NULL/.test(intentIdx.indexdef),
      intentIdx?.indexdef
    );

    const policies = await db.rows<{ tablename: string; policyname: string }>(
      "select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2"
    );
    t.eq(
      "the public read policies are exactly the six the site relies on",
      policies.map((p) => `${p.tablename}:${p.policyname}`),
      [
        "match_scorers:Public read match_scorers",
        "matches:Public read matches",
        "site_settings:Public read site_settings",
        "tournament_rounds:Public read tournament_rounds",
        "tournament_updates:Public read tournament_updates",
        "tournaments:Public read tournaments",
      ]
    );

    const buckets = await db.rows<{ id: string; public: boolean }>("select id, public from storage.buckets order by id");
    t.eq(
      "both Storage buckets are created (against the stub schema here, the real one on a Supabase branch)",
      buckets,
      [
        { id: "tournament-images", public: true },
        { id: "waiver-signatures", public: false },
      ]
    );
    t.eq(
      "and the public read policy for tournament images exists",
      await count(db, "select count(*) from pg_policies where schemaname = 'storage' and policyname = 'Public read tournament images'"),
      1
    );
  }

  /* ---------------------------------------------------------------- */
  /* 4. Applying the whole chain again changes nothing and breaks nothing */
  /* ---------------------------------------------------------------- */
  {
    const before = await db.rows<Item>(`${readFileSync(CATALOG_SQL, "utf8")}`);
    const failures: string[] = [];
    const secondPassReachedForNothing: string[] = [];
    for (const { file } of files) {
      const res = await db.applyFile(join(MIGRATIONS_DIR, file));
      for (const relation of missingRelations(res.notices)) secondPassReachedForNothing.push(`${file}: ${relation}`);
      if (!res.ok) failures.push(`${file}: ${res.error.trim().split("\n").slice(-2).join(" ")}`);
    }
    t.eq("every migration is safe to re-run on a database that already has it", failures, []);
    // A file that drops a relation an earlier file created leaves the same trap
    // for the second pass, on the same two servers, for the same reason.
    t.eq(
      "and none of them reaches for a missing relation on the way through a second time",
      secondPassReachedForNothing,
      []
    );
    const after = await db.rows<Item>(`${readFileSync(CATALOG_SQL, "utf8")}`);
    t.check(
      "and the schema is identical after the second pass",
      canonical(before[0]?.catalog) === canonical(after[0]?.catalog),
      "the second pass changed the catalog"
    );
  }

  /* ---------------------------------------------------------------- */
  /* 5. The fresh build matches production, except where it knowingly does not */
  /* ---------------------------------------------------------------- */
  {
    const production = JSON.parse(readFileSync(PRODUCTION_CATALOG, "utf8")) as Catalog & { _captured?: string };
    const freshRows = await db.rows<{ catalog: Catalog }>(readFileSync(CATALOG_SQL, "utf8"));
    const fresh = freshRows[0]?.catalog;
    t.check("the catalog query runs on the fresh build", !!fresh);

    const differences = diffCatalogs(production, fresh ?? {});
    const explained = new Set<number>();
    const unexplained: Difference[] = [];
    for (const d of differences) {
      const idx = KNOWN_DIFFERENCES.findIndex((k) => k.section === d.section && k.key === d.key && k.kind === d.kind);
      if (idx === -1) unexplained.push(d);
      else explained.add(idx);
    }

    console.log(`\n# fresh build vs production catalog (${production._captured ?? "undated"}): ${differences.length} differences`);
    for (const d of differences) {
      const known = KNOWN_DIFFERENCES.find((k) => k.section === d.section && k.key === d.key && k.kind === d.kind);
      console.log(`  ${known ? "known  " : "NEW    "} ${d.kind.padEnd(15)} ${d.section}: ${d.key}`);
      if (!known) console.log(`          ${d.detail}`);
    }
    console.log("");

    t.eq(
      "every difference from production is on the allow-list with a reason",
      unexplained.map((d) => `${d.kind} ${d.section}: ${d.key}`),
      []
    );
    const stale = KNOWN_DIFFERENCES.filter((_, i) => !explained.has(i)).map((k) => `${k.kind} ${k.section}: ${k.key}`);
    t.eq("every allow-listed difference still exists (none has gone stale)", stale, []);

    const sections = Object.keys(KEY_OF) as Section[];
    const prodCount = sections.reduce((n, s) => n + (production[s]?.length ?? 0), 0);
    const freshCount = sections.reduce((n, s) => n + (fresh?.[s]?.length ?? 0), 0);
    t.check(
      `the catalogs are the same size within the allow-list (production ${prodCount}, fresh ${freshCount})`,
      Math.abs(prodCount - freshCount) <= KNOWN_DIFFERENCES.filter((k) => k.kind !== "changed").length
    );
  }

  t.done();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
