/**
 * A real PostgreSQL for the settlement tests (Stage 1.4).
 *
 * `remediation_stage_1_2_report.md` §8: "the two SQL functions were reviewed by
 * hand and mirrored in scripts/_test-fakes.ts, but **not executed**". Every one
 * of the 329 green assertions was green against an in-memory imitation of the
 * SQL. This module removes that asterisk: it provisions a throwaway database,
 * applies the production-shaped fixture (scripts/sql/local-core-schema.sql) and
 * then the two real migration files verbatim, and hands the tests a way to talk
 * to it.
 *
 * ## No new dependencies
 *
 * It drives the `psql` client through child_process rather than adding a
 * Postgres driver to package.json. The app does not talk to Postgres directly
 * (it goes through PostgREST), so a driver would be a dependency the product
 * never uses, carried for tests alone.
 *
 * ## Where the database comes from, in order
 *
 *   1. `HPS_TEST_DATABASE_URL` — an existing server you point it at. Use this
 *      on a machine that already runs Postgres, or in CI. It is dropped and
 *      recreated on every run, so it must name a THROWAWAY database.
 *   2. a server already listening on `HPS_TEST_PG_PORT` (default 54329).
 *   3. a cluster this module boots itself with initdb/pg_ctl, if those exist.
 *
 * If none works the tests FAIL rather than skip: a silent skip is how a suite
 * goes from "proved" to "green" without anyone noticing. `HPS_SKIP_PG_TESTS=1`
 * skips deliberately and says so loudly.
 *
 * ## What it does NOT prove
 *
 * The application reaches these functions through PostgREST (`supabaseAdmin.rpc`),
 * not through psql. This module calls them the way PostgREST does — by NAMED
 * parameter, `finalize_checkout_payment(p => $json$…$json$::jsonb)` — so an
 * argument-name mismatch is caught, but the HTTP layer itself is not exercised.
 * Local Postgres may also be a different minor version from Supabase (production
 * is 17.6.1); `scripts/test-finalize-sql.ts` asserts the version-sensitive
 * behaviours against the live server instead of assuming them, and prints the
 * server version in its header so the evidence names what it ran on.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEFAULT_PORT = Number(process.env.HPS_TEST_PG_PORT ?? "54329");
const DEFAULT_DB = process.env.HPS_TEST_PG_DATABASE ?? "hps_settlement_test";

/**
 * Walk up from the working directory to the repository root. `import.meta` is
 * not reliably available here (tsx loads a .ts file in a package with no
 * "type":"module" as CommonJS), and these scripts are documented as being run
 * from the repository root, so this both works and fails loudly if it is not.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "supabase", "migrations")) && existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir || up === parse(dir).root) {
      throw new Error(
        `Could not find the repository root from ${process.cwd()}. Run these tests from the repo root, e.g. \`npx tsx scripts/test-finalize-sql.ts\`.`
      );
    }
    dir = up;
  }
}

export const REPO_ROOT = findRepoRoot();
const FIXTURE = join(REPO_ROOT, "scripts", "sql", "local-core-schema.sql");
/**
 * Applied in order, exactly as production would. Add new settlement migrations
 * here — a migration missing from this list is a migration no test executes.
 */
const MIGRATIONS = [
  join(REPO_ROOT, "supabase", "migrations", "20260909120000_registration_resume_access.sql"),
  join(REPO_ROOT, "supabase", "migrations", "20260909120100_stripe_payment_finalization.sql"),
  join(REPO_ROOT, "supabase", "migrations", "20260910120000_finalize_link_tolerance_and_lock_order.sql"),
  join(REPO_ROOT, "supabase", "migrations", "20260910130000_stripe_checkout_attempts.sql"),
];

/* ------------------------------------------------------------------ */
/* SQL literals                                                        */
/* ------------------------------------------------------------------ */

/** A single-quoted SQL string literal. Test inputs only — never user input. */
export function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`lit(): ${value} is not a finite number`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A jsonb literal, dollar-quoted so quotes and backslashes inside the JSON
 * survive both the shell and the parser untouched. Refuses rather than mangles
 * if the payload could close the quote.
 */
export function jsonLit(value: unknown): string {
  const text = JSON.stringify(value);
  const tag = "$hpsjson$";
  if (text.includes(tag)) throw new Error("jsonLit(): payload contains the dollar-quote tag");
  return `${tag}${text}${tag}::jsonb`;
}

/* ------------------------------------------------------------------ */
/* The handle                                                          */
/* ------------------------------------------------------------------ */

export type PgDb = {
  dsn: string;
  serverVersion: string;
  /**
   * The same database reached the way PostgREST reaches it: logged in as
   * `authenticator`, which carries production's statement_timeout and
   * lock_timeout. Null when the caller supplied their own connection string
   * and that role may not exist or may need a password.
   */
  postgrestDsn: string | null;
  /**
   * Run SQL through the production role path: connect as `authenticator`, then
   * SET ROLE service_role, exactly as PostgREST does for the service key.
   */
  viaPostgrest(sql: string): Promise<{ ok: true; out: string } | { ok: false; error: string }>;
  /** Rows of a SELECT, as objects. */
  rows<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** Exactly one row, or null. Throws if the query returns more than one. */
  row<T = Record<string, unknown>>(sql: string): Promise<T | null>;
  /** A single scalar value as text, or null. */
  scalar(sql: string): Promise<string | null>;
  /** A single json/jsonb-returning expression, parsed. */
  json<T>(sql: string): Promise<T>;
  /** Statements with no result. */
  exec(sql: string): Promise<void>;
  /**
   * Apply a SQL file the way the Supabase CLI applies a migration: the whole
   * file as one transaction, aborting on the first error. Returns the error
   * text instead of throwing so a caller can name the file that failed.
   */
  applyFile(path: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Run statements as one transaction in a SEPARATE connection, without
   * awaiting — for concurrency tests. `psql -c` wraps its statements in a
   * single transaction, so the whole string commits or rolls back together.
   */
  concurrent(sql: string): Promise<{ ok: true; out: string } | { ok: false; error: string }>;
  /** Drop and rebuild: fixture + both migrations. */
  reset(): Promise<void>;
};

async function psql(dsn: string, args: string[]): Promise<string> {
  const { stdout } = await run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-d", dsn, ...args], {
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
  });
  return stdout;
}

function makeDb(dsn: string, serverVersion: string, postgrestDsn: string | null): PgDb {
  const db: PgDb = {
    dsn,
    serverVersion,
    postgrestDsn,

    async viaPostgrest(sql: string) {
      if (!postgrestDsn) {
        return { ok: false as const, error: "no authenticator connection available for this database" };
      }
      try {
        const out = await psql(postgrestDsn, ["-c", `set role service_role; ${stripTrailingSemicolon(sql)}`]);
        return { ok: true as const, out: out.trim() };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async rows<T>(sql: string): Promise<T[]> {
      const wrapped = `select coalesce(json_agg(row_to_json(_q)), '[]'::json)::text from (${stripTrailingSemicolon(sql)}) as _q`;
      const out = (await psql(dsn, ["-c", wrapped])).trim();
      return JSON.parse(out || "[]") as T[];
    },

    async row<T>(sql: string): Promise<T | null> {
      const all = await db.rows<T>(sql);
      if (all.length > 1) throw new Error(`row(): expected at most one row, got ${all.length}`);
      return all[0] ?? null;
    },

    async scalar(sql: string): Promise<string | null> {
      const out = (await psql(dsn, ["-c", stripTrailingSemicolon(sql)])).trim();
      return out === "" ? null : out;
    },

    async json<T>(sql: string): Promise<T> {
      const out = (await psql(dsn, ["-c", `select (${stripTrailingSemicolon(sql)})::text`])).trim();
      if (out === "") throw new Error("json(): query returned nothing");
      return JSON.parse(out) as T;
    },

    async exec(sql: string): Promise<void> {
      await psql(dsn, ["-c", sql]);
    },

    async applyFile(path: string) {
      try {
        await psql(dsn, ["--single-transaction", "-f", path]);
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async concurrent(sql: string) {
      try {
        const out = await psql(dsn, ["-c", sql]);
        return { ok: true as const, out: out.trim() };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async reset(): Promise<void> {
      await psql(dsn, ["-f", FIXTURE]);
      for (const file of MIGRATIONS) await psql(dsn, ["-f", file]);
    },
  };
  return db;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

/* ------------------------------------------------------------------ */
/* Provisioning                                                        */
/* ------------------------------------------------------------------ */

function adminDsn(port: number): string {
  const host = process.env.HPS_TEST_PG_HOST ?? "127.0.0.1";
  const user = process.env.HPS_TEST_PG_USER ?? "postgres";
  return `postgresql://${user}@${host}:${port}/postgres`;
}

function testDsn(port: number, database: string): string {
  const host = process.env.HPS_TEST_PG_HOST ?? "127.0.0.1";
  const user = process.env.HPS_TEST_PG_USER ?? "postgres";
  return `postgresql://${user}@${host}:${port}/${database}`;
}

async function reachable(dsn: string): Promise<boolean> {
  try {
    await psql(dsn, ["-c", "select 1"]);
    return true;
  } catch {
    return false;
  }
}

function pgBinDir(): string | null {
  const explicit = process.env.HPS_TEST_PG_BIN;
  if (explicit && existsSync(join(explicit, "initdb"))) return explicit;
  for (const major of ["17", "16", "15", "14"]) {
    const dir = `/usr/lib/postgresql/${major}/bin`;
    if (existsSync(join(dir, "initdb"))) return dir;
  }
  for (const dir of ["/usr/local/pgsql/bin", "/usr/bin", "/opt/homebrew/bin", "/usr/local/bin"]) {
    if (existsSync(join(dir, "initdb"))) return dir;
  }
  return null;
}

/**
 * initdb and postgres refuse to run as root. When we are root and an
 * unprivileged `postgres` account exists (the usual packaged layout), run the
 * server commands through it and put the cluster somewhere it can write.
 */
async function bootCluster(port: number): Promise<string | null> {
  const bin = pgBinDir();
  if (!bin) return null;

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let dataDir: string;
  let asUser: string | null = null;

  if (isRoot) {
    const hasPostgresUser = await run("id", ["postgres"]).then(
      () => true,
      () => false
    );
    if (!hasPostgresUser) return null;
    asUser = "postgres";
    dataDir = "/var/lib/postgresql/hps-stage-1-4";
    await run("sh", ["-c", `rm -rf ${dataDir} && mkdir -p ${dataDir} && chown postgres:postgres ${dataDir} && chmod 700 ${dataDir}`]);
  } else {
    dataDir = join(mkdtempSync(join(tmpdir(), "hps-pg-")), "data");
  }

  const shell = (cmd: string): Promise<unknown> =>
    asUser ? run("su", [asUser, "-c", cmd]) : run("sh", ["-c", cmd]);

  try {
    await shell(`${bin}/initdb -D ${dataDir} -U postgres --auth=trust -E UTF8`);
    // fsync off: this cluster is thrown away at the end of the run.
    await shell(
      `${bin}/pg_ctl -D ${dataDir} -o "-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off" -w -l ${dataDir}/server.log start`
    );
  } catch {
    return null;
  }

  return (await reachable(adminDsn(port))) ? dataDir : null;
}

export type Provisioned = { db: PgDb; note: string };

/**
 * Get an EMPTY throwaway database — nothing applied, not even the fixture —
 * or throw with instructions. Stage 1.6's scripts/test-migrations-from-empty.ts
 * starts here, because its whole point is to prove that supabase/migrations/
 * alone can build the schema; a fixture would beg the question.
 *
 * `databaseName` keeps the two suites apart on a shared server: the settlement
 * tests own `hps_settlement_test`, the migration test owns
 * `hps_migrations_test`, and neither drops the other's database mid-run.
 *
 * With HPS_TEST_DATABASE_URL set, that database is used as-is and the caller
 * is responsible for it being disposable; `databaseName` is ignored and the
 * public schema is wiped by the caller's own reset, not here.
 */
export async function provisionEmptyDatabase(databaseName: string = DEFAULT_DB): Promise<Provisioned> {
  const explicit = process.env.HPS_TEST_DATABASE_URL;
  if (explicit) {
    if (!(await reachable(explicit))) {
      throw new Error(`HPS_TEST_DATABASE_URL is set but not reachable: ${redact(explicit)}`);
    }
    const version = (await psql(explicit, ["-c", "show server_version"])).trim();
    // The caller's own connection string: we cannot assume an `authenticator`
    // login exists there, so the PostgREST path is offered only if it works.
    const asAuthenticator = explicit.replace(/\/\/[^@/]*@/, "//authenticator@");
    const db = makeDb(explicit, version, (await reachable(asAuthenticator)) ? asAuthenticator : null);
    return { db, note: `HPS_TEST_DATABASE_URL (PostgreSQL ${version})` };
  }

  const port = DEFAULT_PORT;
  let note = `local server on port ${port}`;

  if (!(await reachable(adminDsn(port)))) {
    const booted = await bootCluster(port);
    if (!booted) {
      throw new Error(
        [
          "No PostgreSQL available for the settlement tests.",
          "",
          "These tests execute supabase/migrations/20260909120100_stripe_payment_finalization.sql",
          "for real; there is no way to run them without a server. Choose one:",
          "",
          `  • point them at a throwaway database you already have:`,
          `      HPS_TEST_DATABASE_URL=postgresql://user@host:5432/scratch npx tsx scripts/test-finalize-sql.ts`,
          `  • or install a local PostgreSQL (any version 14+) and re-run;`,
          `    this harness will start its own cluster on port ${port}.`,
          "",
          "  • HPS_SKIP_PG_TESTS=1 skips them deliberately and says so in the output.",
        ].join("\n")
      );
    }
    note = `cluster booted by the harness at ${booted} (port ${port})`;
  }

  const version = (await psql(adminDsn(port), ["-c", "show server_version"])).trim();
  await psql(adminDsn(port), ["-c", `drop database if exists ${databaseName} with (force)`]);
  await psql(adminDsn(port), ["-c", `create database ${databaseName}`]);

  const host = process.env.HPS_TEST_PG_HOST ?? "127.0.0.1";
  const db = makeDb(
    testDsn(port, databaseName),
    version,
    `postgresql://authenticator@${host}:${port}/${databaseName}`
  );
  return { db, note: `${note} (PostgreSQL ${version})` };
}

/**
 * Get a rebuilt test database (fixture + the settlement migrations), or throw
 * with instructions. Never returns a half-built one.
 */
export async function provisionTestDatabase(): Promise<Provisioned> {
  const provisioned = await provisionEmptyDatabase(DEFAULT_DB);
  await provisioned.db.reset();
  return provisioned;
}

function redact(dsn: string): string {
  return dsn.replace(/\/\/[^@]*@/, "//***@");
}

/** True when the caller asked for a deliberate skip. */
export function skipRequested(): boolean {
  return process.env.HPS_SKIP_PG_TESTS === "1";
}
