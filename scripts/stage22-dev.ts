/**
 * Stage 2.2 isolated development launcher.
 *
 * Runs this checkout's source against the isolated `hps-dev` Supabase project,
 * and nothing else. Next.js does not load `.env.stage22.local` on its own, and
 * `npm run dev` in this checkout is deliberately *not* the Stage 2.2 launch
 * command (docs/STAGE-2-2-SETUP-CHECKLIST.md §3).
 *
 * What it guarantees, in order:
 *
 *   1. The target is verified before anything starts. Every value that could
 *      name a project is checked against `HPS_DEV_PROJECT_REF`, and Production
 *      is refused outright. See `scripts/stage22-guard.ts`.
 *   2. The app runs from an isolated copy of `src/` and `public/` — no `.env*`,
 *      no `.vercel`, no inherited `.next`. The real checkout is never started,
 *      so a stray `.env.local` cannot be picked up by file precedence.
 *   3. The child process inherits ordinary OS variables only. Stripe, DocuSeal
 *      and Resend credentials are dropped even if present in the shell, so a
 *      development run cannot charge a card, request a signature or send mail.
 *   4. The database URI never reaches the app. It is an operator tool for
 *      migrations and seeding; the app talks PostgREST through the Data API.
 *
 * Usage:
 *   npx tsx scripts/stage22-dev.ts            # verify, then start on :3022
 *   npx tsx scripts/stage22-dev.ts --check    # verify and exit; starts nothing
 *   npx tsx scripts/stage22-dev.ts --port 3023
 *   HPS_STAGE22_ENV_FILE=/path/to/env npx tsx scripts/stage22-dev.ts
 */

import { cpSync, existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  Stage22GuardError,
  assertStage22Target,
  buildStage22Env,
  loadEnvFile,
  preflightSupabaseKeys,
} from "./stage22-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 3022;

/** Values the app itself needs. The database URI is deliberately absent. */
const REQUIRED_APP_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_USER",
  "ADMIN_PASSWORD",
  "APP_SIGNING_SECRET",
] as const;

/** Copied into the isolated run. Anything not listed here does not travel. */
const COPIED_PATHS = [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.mjs",
  "next-env.d.ts",
] as const;

function parseArgs(argv: string[]): { checkOnly: boolean; port: number; offline: boolean } {
  let checkOnly = false;
  let offline = false;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      checkOnly = true;
    } else if (arg === "--offline") {
      offline = true;
    } else if (arg === "--port") {
      port = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    } else {
      throw new Stage22GuardError(`Unrecognised argument: ${arg}`);
    }
  }

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Stage22GuardError(`Use a local port between 1024 and 65535, not ${port}.`);
  }
  return { checkOnly, port, offline };
}

async function main(): Promise<void> {
  const { checkOnly, port, offline } = parseArgs(process.argv.slice(2));

  const envFile =
    process.env.HPS_STAGE22_ENV_FILE?.trim() || path.join(ROOT, ".env.stage22.local");
  const values = loadEnvFile(envFile);

  // (1) Prove the target before anything else happens. Both the API URL the app
  // will use and the operator's database URI must name the declared dev project.
  const ref = assertStage22Target({
    expectedRef: values.HPS_DEV_PROJECT_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: values.NEXT_PUBLIC_SUPABASE_URL, required: true },
      { label: "HPS_DEV_DATABASE_URL", value: values.HPS_DEV_DATABASE_URL },
    ],
  });

  const missing = REQUIRED_APP_KEYS.filter((key) => !values[key]?.trim());
  if (missing.length > 0) {
    throw new Stage22GuardError(
      `${envFile} is missing: ${missing.join(", ")}. See docs/STAGE-2-2-SETUP-CHECKLIST.md §3.`
    );
  }

  const siteUrl = values.NEXT_PUBLIC_SITE_URL?.trim() || `http://127.0.0.1:${port}`;
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(siteUrl)) {
    throw new Stage22GuardError(
      `NEXT_PUBLIC_SITE_URL must stay local for Stage 2.2, not ${siteUrl}. ` +
        `Generated registration, waiver and pay links must never point off this machine.`
    );
  }

  // (4) The app environment. HPS_DEV_DATABASE_URL is not in this object: the
  // database URI is an operator tool for migrations and seeding, never handed
  // to the app or the browser.
  const supplied: Record<string, string> = {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: values.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_USER: values.ADMIN_USER,
    ADMIN_PASSWORD: values.ADMIN_PASSWORD,
    APP_SIGNING_SECRET: values.APP_SIGNING_SECRET,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  };

  // (3) Ordinary OS variables plus exactly the above. Nothing else is inherited.
  const env = buildStage22Env(process.env, supplied);

  console.log(`Stage 2.2 target verified: ${ref}`);
  console.log(`  Data API      ${values.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`  Site URL      ${siteUrl}`);
  console.log(`  Env file      ${envFile}`);
  console.log(
    `  Withheld      database URI, Stripe, DocuSeal, Resend, HPS_TEST_DATABASE_URL, VERCEL_*`
  );

  // Matching refs proves only that the URL points at the right project. It says
  // nothing about whether the keys open it — and a rejected key is invisible
  // until the first query, which is how a whole admin can come up looking fine
  // and then answer "Invalid API key" to everything. So ask the project.
  if (offline) {
    console.log(
      `\n  --offline: the API keys were NOT verified. Only the target ref was checked.`
    );
  } else {
    console.log(`\nVerifying the keys against ${ref}…`);
    const report = await preflightSupabaseKeys({
      supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
      publicKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      elevatedKey: values.SUPABASE_SERVICE_ROLE_KEY,
      expectedRef: ref,
    });
    for (const line of report.lines) console.log(`  ${line}`);
    if (!report.ok) {
      const how = report.unreachable
        ? `\n  If this machine genuinely has no route to Supabase, re-run with --offline —\n  but the app will not work either, because it makes the same calls.`
        : `\n  Fix the key in ${envFile}, or re-run:  npx tsx scripts/stage22-setup-env.ts --force`;
      throw new Stage22GuardError(
        `API key preflight failed.\n\n  - ${report.problems.join("\n  - ")}${how}`
      );
    }
    console.log(`  Both keys authenticate to ${ref}.`);
  }

  if (checkOnly) {
    console.log(
      offline
        ? "\n--check: target and environment verified. The API keys were NOT verified. Nothing was started."
        : "\n--check: target, environment and API keys verified. Nothing was started."
    );
    return;
  }

  if (!existsSync(path.join(ROOT, "node_modules/next"))) {
    throw new Stage22GuardError("Run npm install in the repository first.");
  }

  // (2) Isolated copy. `.env*`, `.vercel` and the checkout's `.next` are not in
  // COPIED_PATHS, so Next.js starts in a directory where they do not exist.
  const workdir = mkdtempSync(path.join(tmpdir(), "hps-stage22-"));
  for (const entry of COPIED_PATHS) {
    const from = path.join(ROOT, entry);
    if (!existsSync(from)) continue; // next-env.d.ts is generated, not tracked
    cpSync(from, path.join(workdir, entry), { recursive: true });
  }
  symlinkSync(
    path.join(ROOT, "node_modules"),
    path.join(workdir, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );

  console.log(`  Source copy   ${workdir}`);
  console.log(
    `\nAdmin: ${siteUrl}/admin  (user ${values.ADMIN_USER})\n` +
      `Restart this command to pick up source changes. Ctrl+C stops it.\n`
  );

  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    // `env` is a complete, deliberately-built environment; the cast is only to
    // satisfy Next.js's augmented ProcessEnv, which declares NODE_ENV required.
    { cwd: workdir, env: env as NodeJS.ProcessEnv, stdio: "inherit", windowsHide: true }
  );

  child.once("error", (error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code: number | null) => {
    process.exitCode = code ?? 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => child.kill());
  }
}

main().catch((error: unknown) => {
  if (error instanceof Stage22GuardError) {
    console.error(`\nStage 2.2 refused to start.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
