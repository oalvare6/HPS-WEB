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
import { provisionEmptyDatabase, REPO_ROOT, skipRequested, type PgDb } from "./_pg";

const t = new Harness();

const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const PREAMBLE = join(REPO_ROOT, "scripts", "sql", "local-supabase-preamble.sql");
const CATALOG_SQL = join(REPO_ROOT, "scripts", "sql", "schema-catalog.sql");
const PRODUCTION_CATALOG = join(REPO_ROOT, "docs", "production-schema-catalog-2026-09-10.json");
const DATABASE_NAME = "hps_migrations_test";

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

const LEDGER_TAG = "$hpsmigration$";

async function recordInLedger(db: PgDb, version: string, name: string, sql: string) {
  if (sql.includes(LEDGER_TAG)) throw new Error(`${name} contains the ledger quote tag`);
  await db.exec(
    `insert into supabase_migrations.schema_migrations (version, statements, name)
     values ('${version}', array[${LEDGER_TAG}${sql}${LEDGER_TAG}], '${name}')
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
  /* 1. File names are what the platform expects                       */
  /* ---------------------------------------------------------------- */
  {
    const bad = files.filter((f) => !f.version);
    t.check("every file is named <14-digit version>_<snake_name>.sql", bad.length === 0, bad.map((b) => b.file).join(", "));
    const versions = new Set(files.map((f) => f.version));
    t.eq("no two files share a version", versions.size, files.length);
  }

  /* ---------------------------------------------------------------- */
  /* 2. The chain applies, in order, from nothing                      */
  /* ---------------------------------------------------------------- */
  let firstFailure: { file: string; error: string } | null = null;
  for (const { file, version, name } of files) {
    const res = await db.applyFile(join(MIGRATIONS_DIR, file));
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
    for (const { file } of files) {
      const res = await db.applyFile(join(MIGRATIONS_DIR, file));
      if (!res.ok) failures.push(`${file}: ${res.error.trim().split("\n").slice(-2).join(" ")}`);
    }
    t.eq("every migration is safe to re-run on a database that already has it", failures, []);
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
