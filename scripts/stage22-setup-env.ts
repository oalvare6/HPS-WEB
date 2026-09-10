/**
 * Stage 2.2 — write `.env.stage22.local` on the operator's machine.
 *
 * The service-role key must exist in exactly one place: this ignored file. It
 * is never printed, never committed, never pasted into a chat window. So this
 * script reads it from a masked prompt, writes the file with owner-only
 * permissions, and echoes nothing back but the key's length.
 *
 * Everything except the service-role key is already known and is filled in for
 * you: the project ref, the API URL and the anon key belong to the isolated
 * `hps-dev` project, and the admin password and signing secret are generated
 * here with crypto.randomBytes.
 *
 * Run from the repository root:
 *
 *   npx tsx scripts/stage22-setup-env.ts
 *
 * It refuses to overwrite an existing file unless you pass --force.
 */

import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import {
  PRODUCTION_SUPABASE_REF,
  Stage22GuardError,
  assertStage22Target,
} from "./stage22-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, ".env.stage22.local");

/** The isolated development project created for Stage 2.2. Not a secret. */
const DEV_REF = "tfkdtwgxnumnuiiayrld";
const DEV_URL = `https://${DEV_REF}.supabase.co`;
/** hps-dev's legacy anon key. Publishable by design — safe in a browser. */
const DEV_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRma2R0d2d4bnVtbnVpaWF5cmxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNzA2MzAsImV4cCI6MjEwNDY0NjYzMH0." +
  "WBmlPEm5OOzjJgK4Ehjaj66UrJPJex2kzJipKna6D7k";

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

function looksLikeServiceRoleKey(key: string): { ok: boolean; why?: string } {
  if (!key) return { ok: false, why: "nothing was entered" };
  if (key.includes(PRODUCTION_SUPABASE_REF)) {
    return { ok: false, why: "this key belongs to the PRODUCTION project" };
  }
  // Legacy service_role keys are JWTs; the newer form is `sb_secret_...`.
  if (key.startsWith("sb_secret_")) return { ok: true };
  const parts = key.split(".");
  if (parts.length !== 3) {
    return { ok: false, why: "not a JWT and not an sb_secret_ key" };
  }
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: string;
      ref?: string;
    };
    if (claims.role !== "service_role") {
      return { ok: false, why: `this key's role is "${claims.role}", not service_role` };
    }
    if (claims.ref !== DEV_REF) {
      return { ok: false, why: `this key belongs to project ${claims.ref}, not ${DEV_REF}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, why: "the JWT payload could not be read" };
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  if (existsSync(TARGET) && !force) {
    throw new Stage22GuardError(
      `${TARGET} already exists. Re-run with --force to replace it.`
    );
  }

  console.log(`Stage 2.2 environment file\n`);
  console.log(`  Project     hps-dev (${DEV_REF})`);
  console.log(`  API URL     ${DEV_URL}`);
  console.log(`  Writing     ${TARGET}\n`);
  console.log(`Open the Supabase dashboard for hps-dev → Project Settings → API keys,`);
  console.log(`copy the *service_role* (secret) key, and paste it below.`);
  console.log(`Your paste is hidden and is never echoed, logged or committed.\n`);

  const serviceKey = await promptSecret("service_role key: ");
  const verdict = looksLikeServiceRoleKey(serviceKey);
  if (!verdict.ok) {
    throw new Stage22GuardError(`That does not look like hps-dev's service_role key — ${verdict.why}.`);
  }

  // Prove the target one more time before writing anything.
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: DEV_URL, required: true },
      { label: "anon key", value: DEV_ANON_KEY },
    ],
  });

  const adminPassword = randomBytes(18).toString("base64url");
  const signingSecret = randomBytes(48).toString("base64url");

  const contents = [
    "# Stage 2.2 — isolated hps-dev development values ONLY.",
    "# Ignored by .gitignore (.env*.local). Never commit this file, never copy it",
    "# to .env.local, and never point it at Production (jqkiswwunrnyqjgroqtn).",
    "# Loaded explicitly by scripts/stage22-dev.ts; Next.js does not load this name.",
    "",
    `HPS_DEV_PROJECT_REF=${DEV_REF}`,
    `NEXT_PUBLIC_SUPABASE_URL=${DEV_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${DEV_ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022",
    "ADMIN_USER=hps-stage22",
    `ADMIN_PASSWORD=${adminPassword}`,
    `APP_SIGNING_SECRET=${signingSecret}`,
    "",
  ].join("\n");

  writeFileSync(TARGET, contents, { mode: 0o600 });

  console.log(`\nWrote ${TARGET}`);
  console.log(`  service_role key stored (${serviceKey.length} characters). Not shown again.`);
  console.log(`  A fresh admin password and signing secret were generated.\n`);
  console.log(`Your admin sign-in for the local Stage 2.2 site:`);
  console.log(`  user      hps-stage22`);
  console.log(`  password  ${adminPassword}`);
  console.log(`\n(The password is local-only and exists nowhere but this file.)`);
  console.log(`\nNext:  npx tsx scripts/stage22-dev.ts --check`);
}

main().catch((error: unknown) => {
  if (error instanceof Stage22GuardError) {
    console.error(`\nRefused.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
