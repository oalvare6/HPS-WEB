/**
 * Stage 2.2 — write `.env.stage22.local` on the operator's machine.
 *
 * Both keys are asked for, neither is baked in, and neither is echoed back.
 *
 * An earlier version of this script hardcoded hps-dev's legacy anon key as a
 * constant. That was wrong for two reasons, and both are worth stating because
 * they are easy to reintroduce:
 *
 *   1. A key pinned in source goes stale the moment it is rotated or disabled,
 *      and the resulting `.env.stage22.local` looks perfectly well-formed while
 *      being useless. Nothing in the file says which key it came from.
 *   2. It hid the more dangerous half. The *secret* key was accepted on shape
 *      alone — anything starting with `sb_secret_` passed — and an `sb_secret_…`
 *      key does not encode its project. A secret key belonging to a completely
 *      different project would have been written to the file without complaint,
 *      and the first symptom would have been "Invalid API key" on every query.
 *
 * So: no constants, and nothing is written until the project itself confirms
 * both keys work. Shape checking catches a swapped pair offline; only a live
 * call can catch a wrong-project opaque key, so a live call is made.
 *
 * Run from the repository root:
 *
 *   npx tsx scripts/stage22-setup-env.ts            # --force to replace an existing file
 *   npx tsx scripts/stage22-setup-env.ts --offline  # skip verification (not recommended)
 */

import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import {
  Stage22GuardError,
  assertStage22Target,
  classifySupabaseKey,
  preflightSupabaseKeys,
} from "./stage22-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, ".env.stage22.local");

/**
 * The isolated development project. The ref and URL are identifiers, not
 * credentials — the guard needs to name its allowed target, and this is it.
 * No API key appears in this file, by design.
 */
const DEV_REF = "tfkdtwgxnumnuiiayrld";
const DEV_URL = `https://${DEV_REF}.supabase.co`;

/** Read a line without echoing it. Works in Windows Terminal, PowerShell and cmd. */
function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const asMutable = rl as unknown as { _writeToOutput?: (s: string) => void };
    let muted = false;
    asMutable._writeToOutput = function (s: string) {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
    muted = true;
  });
}

/** Describe a key without revealing it. */
function describe(key: string): string {
  const info = classifySupabaseKey(key);
  return `${info.kind}, ${key.length} characters`;
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const offline = process.argv.includes("--offline");

  if (existsSync(TARGET) && !force) {
    throw new Stage22GuardError(
      `${TARGET} already exists. Re-run with --force to replace it.`
    );
  }

  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [{ label: "NEXT_PUBLIC_SUPABASE_URL", value: DEV_URL, required: true }],
  });

  console.log(`Stage 2.2 environment file\n`);
  console.log(`  Project   hps-dev (${DEV_REF})`);
  console.log(`  API URL   ${DEV_URL}`);
  console.log(`  Writing   ${TARGET}\n`);
  console.log(`Open the hps-dev dashboard → Project Settings → API keys, and copy BOTH keys.`);
  console.log(`Either key format works — the current sb_publishable_… / sb_secret_… pair, or`);
  console.log(`the legacy anon / service_role pair. Do not mix one project's key with another's.`);
  console.log(`Your pastes are hidden and are never echoed, logged or committed.\n`);

  const publicKey = await promptSecret("publishable (or legacy anon) key: ");
  if (!publicKey) throw new Stage22GuardError("No public key was entered.");
  const elevatedKey = await promptSecret("secret (or legacy service_role) key: ");
  if (!elevatedKey) throw new Stage22GuardError("No server key was entered.");

  console.log(`\n  public key  ${describe(publicKey)}`);
  console.log(`  server key  ${describe(elevatedKey)}`);

  if (offline) {
    console.log(
      `\n  --offline: the keys were NOT verified against ${DEV_REF}. If either is wrong,\n` +
        `  every query will fail with "Invalid API key" once the app starts.`
    );
    // Shape checks still apply — they catch a swapped pair and a wrong-project JWT.
    await preflightShapeOnly(publicKey, elevatedKey);
  } else {
    console.log(`\nVerifying both keys against ${DEV_REF}…`);
    const report = await preflightSupabaseKeys({
      supabaseUrl: DEV_URL,
      publicKey,
      elevatedKey,
      expectedRef: DEV_REF,
    });
    for (const line of report.lines) console.log(`  ${line}`);
    if (!report.ok) {
      throw new Stage22GuardError(
        `Not writing ${TARGET} — the keys did not check out.\n\n  - ${report.problems.join("\n  - ")}`
      );
    }
    console.log(`  Both keys authenticate to ${DEV_REF}.`);
  }

  const adminPassword = randomBytes(18).toString("base64url");
  const signingSecret = randomBytes(48).toString("base64url");

  const contents = [
    "# Stage 2.2 — isolated hps-dev development values ONLY.",
    "# Ignored by .gitignore (.env*.local). Never commit this file, never copy it",
    "# to .env.local, and never point it at Production (jqkiswwunrnyqjgroqtn).",
    "# Loaded explicitly by scripts/stage22-dev.ts; Next.js does not load this name.",
    "#",
    "# Both keys were verified against the live project when this file was written.",
    "# If either is rotated, re-run: npx tsx scripts/stage22-setup-env.ts --force",
    "",
    `HPS_DEV_PROJECT_REF=${DEV_REF}`,
    `NEXT_PUBLIC_SUPABASE_URL=${DEV_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${publicKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${elevatedKey}`,
    "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022",
    "ADMIN_USER=hps-stage22",
    `ADMIN_PASSWORD=${adminPassword}`,
    `APP_SIGNING_SECRET=${signingSecret}`,
    "",
  ].join("\n");

  writeFileSync(TARGET, contents, { mode: 0o600 });

  console.log(`\nWrote ${TARGET} (mode 600). Neither key is shown again.`);
  console.log(`A fresh admin password and signing secret were generated.\n`);
  console.log(`Your admin sign-in for the local Stage 2.2 site:`);
  console.log(`  user      hps-stage22`);
  console.log(`  password  ${adminPassword}`);
  console.log(`\n(Local-only, and it exists nowhere but this file.)`);
  console.log(`\nNext:  npx tsx scripts/stage22-dev.ts --check`);
}

/** Offline path: shape and project checks only, no network. */
async function preflightShapeOnly(publicKey: string, elevatedKey: string): Promise<void> {
  const { assertKeyFitsSlot } = await import("./stage22-guard");
  assertKeyFitsSlot(publicKey, "public", "NEXT_PUBLIC_SUPABASE_ANON_KEY", DEV_REF);
  assertKeyFitsSlot(elevatedKey, "elevated", "SUPABASE_SERVICE_ROLE_KEY", DEV_REF);
  if (publicKey === elevatedKey) {
    throw new Stage22GuardError("The public and server keys are the same value; one is wrong.");
  }
}

main().catch((error: unknown) => {
  if (error instanceof Stage22GuardError) {
    console.error(`\nRefused.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
