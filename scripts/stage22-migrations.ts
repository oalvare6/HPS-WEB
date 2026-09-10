/**
 * Stage 2.2 migration planner and ledger verifier.
 *
 * Migrations are applied to `hps-dev` through the Supabase management API, not
 * the CLI (this environment has no CLI, and the management path needs no
 * database password — so no database secret passes through the session at all).
 * That means the target is chosen per call, which is exactly the thing worth
 * guarding. This script is where the guarding happens:
 *
 *   --plan    Verify the declared target, then emit the authoritative ordered
 *             manifest of the 41 migrations with a digest of each file. The
 *             operator applies exactly this list, in exactly this order.
 *
 *   --verify  Verify the declared target, then compare the remote ledger
 *             (`supabase_migrations.schema_migrations`, piped in as JSON) with
 *             the local files. Exits non-zero on any drift: a missing version,
 *             an extra one, or the wrong order.
 *
 * The split is deliberate. The management API does the I/O; this script owns
 * the decision about *what* may be applied and *where*, and it refuses
 * Production before it will answer either question.
 *
 * Usage:
 *   npx tsx scripts/stage22-migrations.ts --plan
 *   <ledger json> | npx tsx scripts/stage22-migrations.ts --verify
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Stage22GuardError, assertStage22Target, loadEnvFile } from "./stage22-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

/** The manifest recorded in docs/STAGE-2-2-SETUP-CHECKLIST.md §2. */
const EXPECTED_COUNT = 41;
const EXPECTED_LATEST = "20260910130000";

export interface MigrationFile {
  version: string;
  name: string;
  file: string;
  bytes: number;
  sha256: string;
}

/** Read `supabase/migrations/` in filename order — which is version order. */
export function readMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((file) => {
    const match = /^(\d{14})_(.+)\.sql$/.exec(file);
    if (!match) {
      throw new Stage22GuardError(
        `${file} is not a migration filename. Only YYYYMMDDHHMMSS_name.sql belongs ` +
          `in supabase/migrations/ (see CLAUDE.md).`
      );
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    return {
      version: match[1],
      name: match[2],
      file,
      bytes: Buffer.byteLength(sql, "utf8"),
      sha256: createHash("sha256").update(sql, "utf8").digest("hex").slice(0, 16),
    };
  });
}

/** Guard the declared target, then hand back the validated ref. */
function verifyTarget(): string {
  const envFile =
    process.env.HPS_STAGE22_ENV_FILE?.trim() || path.join(ROOT, ".env.stage22.local");
  const values = loadEnvFile(envFile);
  return assertStage22Target({
    expectedRef: values.HPS_DEV_PROJECT_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: values.NEXT_PUBLIC_SUPABASE_URL, required: true },
      { label: "HPS_DEV_DATABASE_URL", value: values.HPS_DEV_DATABASE_URL },
    ],
  });
}

function assertManifestShape(migrations: MigrationFile[]): void {
  if (migrations.length !== EXPECTED_COUNT) {
    throw new Stage22GuardError(
      `Expected ${EXPECTED_COUNT} migrations, found ${migrations.length}. ` +
        `The checklist manifest and this checkout disagree; stop and reconcile.`
    );
  }
  const latest = migrations[migrations.length - 1].version;
  if (latest !== EXPECTED_LATEST) {
    throw new Stage22GuardError(
      `Latest local migration is ${latest}, expected ${EXPECTED_LATEST}.`
    );
  }
  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Stage22GuardError(`Duplicate migration version ${m.version}.`);
    }
    seen.add(m.version);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

/** Compare the remote ledger with the local files. Returns problem lines. */
export function diffLedger(
  local: MigrationFile[],
  remote: Array<{ version: string }>
): string[] {
  const problems: string[] = [];
  const localVersions = local.map((m) => m.version);
  const remoteVersions = remote.map((r) => String(r.version));

  for (const version of localVersions) {
    if (!remoteVersions.includes(version)) {
      problems.push(`missing from ${"hps-dev"}: ${version}`);
    }
  }
  for (const version of remoteVersions) {
    if (!localVersions.includes(version)) {
      problems.push(`present remotely but not in this checkout: ${version}`);
    }
  }
  if (problems.length === 0) {
    const remoteSorted = [...remoteVersions].sort();
    for (let i = 0; i < localVersions.length; i += 1) {
      if (remoteSorted[i] !== localVersions[i]) {
        problems.push(`order mismatch at ${i}: local ${localVersions[i]}, remote ${remoteSorted[i]}`);
      }
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--plan" && mode !== "--verify") {
    throw new Stage22GuardError("Use --plan or --verify.");
  }

  const ref = verifyTarget();
  const migrations = readMigrations();
  assertManifestShape(migrations);

  if (mode === "--plan") {
    console.log(`Target verified: ${ref}`);
    console.log(`${migrations.length} migrations, ${migrations[0].version} .. ${EXPECTED_LATEST}\n`);
    migrations.forEach((m, i) => {
      console.log(
        `${String(i + 1).padStart(2, " ")}. ${m.version}  ${m.sha256}  ${String(m.bytes).padStart(6, " ")}B  ${m.name}`
      );
    });
    console.log(`\nApply in exactly this order. Nothing else may be applied to ${ref}.`);
    return;
  }

  const raw = (await readStdin()).trim();
  if (!raw) {
    throw new Stage22GuardError(
      "--verify expects the remote ledger as JSON on stdin, e.g. the rows of " +
        "supabase_migrations.schema_migrations."
    );
  }
  let remote: Array<{ version: string }>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    remote = parsed as Array<{ version: string }>;
  } catch (error) {
    throw new Stage22GuardError(`Could not parse the ledger JSON: ${String(error)}`);
  }

  const problems = diffLedger(migrations, remote);
  console.log(`Target verified: ${ref}`);
  console.log(`local files: ${migrations.length}   remote ledger rows: ${remote.length}`);

  if (problems.length > 0) {
    console.error(`\nLedger does NOT match this checkout:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Ledger matches all ${migrations.length} local migrations; latest ${EXPECTED_LATEST}.`);
}

main().catch((error: unknown) => {
  if (error instanceof Stage22GuardError) {
    console.error(`\nStage 2.2 refused.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
