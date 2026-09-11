/**
 * Proves the Stage 2.2 isolation guard before it ever guards anything real.
 *
 * The guard is the only thing standing between a development run and the
 * Production project. A guard that has never been fired at Production is not
 * evidence of anything — the same reasoning as the tripwire self-check in
 * `scripts/test-migrations-from-empty.ts`. So this suite fires the Production
 * ref at it in every shape the checklist names (API hostname, direct database
 * hostname, pooler username) and requires a refusal each time.
 *
 * It also proves the stronger property: the guard is an allowlist of one, not a
 * denylist. A ref that is neither Production nor the declared development
 * target is refused too.
 *
 * Run: npx tsx scripts/test-stage22-guard.ts
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PRODUCTION_SUPABASE_REF,
  Stage22GuardError,
  assertDevRef,
  assertKeyFitsSlot,
  assertNotProduction,
  assertStage22Target,
  buildStage22Env,
  classifySupabaseKey,
  extractSupabaseRef,
  isForbiddenEnvKey,
  isSupabaseRef,
  loadEnvFile,
  parseEnvFile,
  preflightSupabaseKeys,
  probeSupabaseKey,
} from "./stage22-guard";

const DEV_REF = "abcdefghijklmnopqrst";
const OTHER_REF = "zyxwvutsrqponmlkjihg";

let checks = 0;

function refuses(label: string, run: () => unknown): void {
  checks += 1;
  try {
    run();
  } catch (error) {
    assert.ok(
      error instanceof Stage22GuardError,
      `${label}: expected Stage22GuardError, got ${String(error)}`
    );
    return;
  }
  assert.fail(`${label}: expected a refusal, but the guard allowed it`);
}

function allows(label: string, run: () => unknown): void {
  checks += 1;
  try {
    run();
  } catch (error) {
    assert.fail(`${label}: expected the guard to allow this, got ${String(error)}`);
  }
}

// --- The tripwire is armed: Production is refused in every documented form ---
// docs/STAGE-2-2-SETUP-CHECKLIST.md §1 requires rejecting the Production ref
// "including its API hostname, direct database hostname and pooler username".

const PRODUCTION_FORMS: Array<[string, string]> = [
  ["bare ref", PRODUCTION_SUPABASE_REF],
  ["API URL", `https://${PRODUCTION_SUPABASE_REF}.supabase.co`],
  ["API hostname", `${PRODUCTION_SUPABASE_REF}.supabase.co`],
  ["direct database hostname", `db.${PRODUCTION_SUPABASE_REF}.supabase.co`],
  [
    "direct database URI",
    `postgresql://postgres:pw@db.${PRODUCTION_SUPABASE_REF}.supabase.co:5432/postgres`,
  ],
  [
    "session pooler URI",
    `postgresql://postgres.${PRODUCTION_SUPABASE_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  ],
  ["uppercased ref", PRODUCTION_SUPABASE_REF.toUpperCase()],
  ["ref inside an unrelated string", `notes: target was ${PRODUCTION_SUPABASE_REF} yesterday`],
];

for (const [shape, value] of PRODUCTION_FORMS) {
  refuses(`assertNotProduction rejects Production as ${shape}`, () =>
    assertNotProduction(value, "candidate")
  );
  refuses(`assertStage22Target rejects Production as ${shape}`, () =>
    assertStage22Target({
      expectedRef: DEV_REF,
      candidates: [{ label: "candidate", value, required: true }],
    })
  );
}

// Production can never be declared as the development target either.
refuses("Production cannot be the declared dev ref", () =>
  assertDevRef(PRODUCTION_SUPABASE_REF)
);

// --- Allowlist of one, not a denylist -------------------------------------
// A ref that is perfectly valid and not Production is still refused unless it
// is *the* declared target. This is what makes the guard safe against projects
// nobody thought to deny.

refuses("a non-Production ref that is not the declared target is refused", () =>
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: `https://${OTHER_REF}.supabase.co`, required: true },
    ],
  })
);

refuses("a mismatched database URI is refused even when the API URL is correct", () =>
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: `https://${DEV_REF}.supabase.co`, required: true },
      {
        label: "HPS_DEV_DATABASE_URL",
        value: `postgresql://postgres.${OTHER_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
        required: true,
      },
    ],
  })
);

// --- The declared target is accepted, in each of its legitimate forms ------

allows("the declared dev target is accepted across API URL, db URI and pooler URI", () => {
  const ref = assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: `https://${DEV_REF}.supabase.co`, required: true },
      {
        label: "HPS_DEV_DATABASE_URL",
        value: `postgresql://postgres:pw@db.${DEV_REF}.supabase.co:5432/postgres`,
        required: true,
      },
      {
        label: "pooler",
        value: `postgresql://postgres.${DEV_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
        required: true,
      },
      { label: "bare ref", value: DEV_REF, required: true },
    ],
  });
  assert.equal(ref, DEV_REF);
});

// --- A missing or malformed declaration stops everything ------------------

refuses("an unset HPS_DEV_PROJECT_REF stops the action", () => assertDevRef(undefined));
refuses("an empty HPS_DEV_PROJECT_REF stops the action", () => assertDevRef("   "));
refuses("a malformed ref is refused", () => assertDevRef("not-a-ref"));
refuses("a too-short ref is refused", () => assertDevRef("abcdef"));

refuses("a required candidate that is missing stops the action", () =>
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [{ label: "HPS_DEV_DATABASE_URL", value: undefined, required: true }],
  })
);

// A value that names no Supabase project cannot be verified. Required means it
// must be verifiable; optional means an unrelated value is simply not a target.
refuses("a required but unverifiable target is refused", () =>
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [{ label: "NEXT_PUBLIC_SUPABASE_URL", value: "http://127.0.0.1:5555", required: true }],
  })
);
allows("an optional non-Supabase value is not treated as a target", () =>
  assertStage22Target({
    expectedRef: DEV_REF,
    candidates: [{ label: "NEXT_PUBLIC_SITE_URL", value: "http://127.0.0.1:3022" }],
  })
);

// --- Ref extraction -------------------------------------------------------

checks += 1;
assert.equal(extractSupabaseRef(`https://${DEV_REF}.supabase.co`), DEV_REF);
checks += 1;
assert.equal(extractSupabaseRef(`db.${DEV_REF}.supabase.co`), DEV_REF);
checks += 1;
assert.equal(
  extractSupabaseRef(`postgresql://postgres.${DEV_REF}:s3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres`),
  DEV_REF
);
checks += 1;
assert.equal(extractSupabaseRef("http://127.0.0.1:3021"), null, "a fixture URL names no project");
checks += 1;
assert.equal(extractSupabaseRef(""), null);
checks += 1;
assert.equal(extractSupabaseRef(undefined), null);
checks += 1;
assert.equal(isSupabaseRef(DEV_REF), true);
checks += 1;
assert.equal(isSupabaseRef("SHORT"), false);

// A percent-encoded password must not shift which host the guard reads.
checks += 1;
assert.equal(
  extractSupabaseRef(`postgresql://postgres:p%40ss%2Fword@db.${DEV_REF}.supabase.co:5432/postgres`),
  DEV_REF
);

// --- Forbidden environment variables --------------------------------------

for (const key of [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "DOCUSEAL_API_KEY",
  "DOCUSEAL_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESUME_EMAIL_FROM",
  "RESUME_EMAIL_REPLY_TO",
  "VERCEL_OIDC_TOKEN",
  "HPS_TEST_DATABASE_URL",
  "ADMIN_SESSION_SECRET",
]) {
  checks += 1;
  assert.equal(isForbiddenEnvKey(key), true, `${key} must be forbidden in a Stage 2.2 process`);
}

for (const key of ["PATH", "NEXT_PUBLIC_SUPABASE_URL", "ADMIN_USER", "APP_SIGNING_SECRET"]) {
  checks += 1;
  assert.equal(isForbiddenEnvKey(key), false, `${key} must be allowed`);
}

checks += 1;
{
  const child = buildStage22Env(
    {
      PATH: "/usr/bin",
      HOME: "/home/dev",
      // Ambient credentials that must NOT be inherited.
      // Deliberately not shaped like a real Stripe key: this is a fixture, and
      // a committed live-key-shaped literal trips secret scanners for no reason.
      STRIPE_SECRET_KEY: "ambient-stripe-key-must-not-reach-the-child",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "production-key",
      HPS_TEST_DATABASE_URL: "postgresql://localhost:54329/scratch",
    },
    {
      NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
      ADMIN_USER: "hps-stage22",
      // Even a forbidden key supplied explicitly is dropped.
      RESEND_API_KEY: "re_should_be_dropped",
    }
  );

  assert.equal(child.PATH, "/usr/bin");
  assert.equal(child.HOME, "/home/dev");
  assert.equal(child.ADMIN_USER, "hps-stage22");
  assert.equal(
    child.NEXT_PUBLIC_SUPABASE_URL,
    `https://${DEV_REF}.supabase.co`,
    "the supplied dev URL must replace the ambient production one"
  );
  assert.equal(child.STRIPE_SECRET_KEY, undefined, "ambient Stripe credentials must not be inherited");
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined, "ambient service key must not be inherited");
  assert.equal(child.HPS_TEST_DATABASE_URL, undefined, "reset-based suites must not see this project");
  assert.equal(child.RESEND_API_KEY, undefined, "a forbidden key must be dropped even when supplied");
  assert.ok(
    !JSON.stringify(child).includes(PRODUCTION_SUPABASE_REF),
    "no Production reference may survive into the child environment"
  );
}

// --- .env parsing ---------------------------------------------------------

checks += 1;
{
  const parsed = parseEnvFile(
    [
      "# a comment",
      "",
      `NEXT_PUBLIC_SUPABASE_URL=https://${DEV_REF}.supabase.co`,
      'ADMIN_PASSWORD="quoted value"',
      "APP_SIGNING_SECRET='single quoted'",
      "export HPS_DEV_PROJECT_REF=" + DEV_REF,
      "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022 # inline comment",
      "not a valid line",
      "9INVALID=x",
    ].join("\n")
  );

  assert.equal(parsed.NEXT_PUBLIC_SUPABASE_URL, `https://${DEV_REF}.supabase.co`);
  assert.equal(parsed.ADMIN_PASSWORD, "quoted value");
  assert.equal(parsed.APP_SIGNING_SECRET, "single quoted");
  assert.equal(parsed.HPS_DEV_PROJECT_REF, DEV_REF);
  assert.equal(parsed.NEXT_PUBLIC_SITE_URL, "http://127.0.0.1:3022");
  assert.equal(parsed["9INVALID"], undefined);
}

checks += 1;
refuses("a missing env file is a refusal, not a silent empty object", () =>
  loadEnvFile(path.join(tmpdir(), "hps-stage22-does-not-exist-", "nope.env"))
);

checks += 1;
{
  const dir = mkdtempSync(path.join(tmpdir(), "hps-stage22-env-"));
  const file = path.join(dir, ".env.stage22.local");
  writeFileSync(file, `HPS_DEV_PROJECT_REF=${DEV_REF}\n`, "utf8");
  assert.equal(loadEnvFile(file).HPS_DEV_PROJECT_REF, DEV_REF);
}

// --- API key classification and slot fit ----------------------------------
// The bug this covers: matching project refs proved only that the URL was
// right. Both keys could be wrong, or swapped, and nothing noticed until every
// query answered "Invalid API key".

function jwtKey(role: string, ref: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "supabase", ref, role })).toString("base64url");
  return `${header}.${payload}.signature-not-checked-offline`;
}

const PUBLISHABLE = "sb_publishable_AbCdEf0123456789";
const SECRET = "sb_secret_AbCdEf0123456789";

checks += 1;
assert.equal(classifySupabaseKey(PUBLISHABLE).kind, "publishable");
checks += 1;
assert.equal(classifySupabaseKey(PUBLISHABLE).isPublic, true);
checks += 1;
assert.equal(classifySupabaseKey(SECRET).kind, "secret");
checks += 1;
assert.equal(classifySupabaseKey(SECRET).isElevated, true);
checks += 1;
assert.equal(classifySupabaseKey(jwtKey("anon", DEV_REF)).kind, "legacy-anon");
checks += 1;
assert.equal(classifySupabaseKey(jwtKey("service_role", DEV_REF)).kind, "legacy-service-role");
checks += 1;
assert.equal(classifySupabaseKey(jwtKey("anon", DEV_REF)).ref, DEV_REF);
checks += 1;
assert.equal(classifySupabaseKey("nonsense").kind, "unknown");
checks += 1;
assert.equal(classifySupabaseKey(undefined).kind, "unknown");

// An opaque secret key carries no project, which is exactly why a live probe
// is required — this asserts the limitation rather than papering over it.
checks += 1;
assert.equal(classifySupabaseKey(SECRET).ref, null, "sb_secret_ keys name no project offline");

allows("a correct pair fits its slots", () => {
  assertKeyFitsSlot(PUBLISHABLE, "public", "public key", DEV_REF);
  assertKeyFitsSlot(SECRET, "elevated", "server key", DEV_REF);
});
allows("legacy keys for the right project also fit", () => {
  assertKeyFitsSlot(jwtKey("anon", DEV_REF), "public", "public key", DEV_REF);
  assertKeyFitsSlot(jwtKey("service_role", DEV_REF), "elevated", "server key", DEV_REF);
});

refuses("an elevated key in the PUBLIC slot is refused", () =>
  assertKeyFitsSlot(SECRET, "public", "public key", DEV_REF)
);
refuses("a public key in the ELEVATED slot is refused", () =>
  assertKeyFitsSlot(PUBLISHABLE, "elevated", "server key", DEV_REF)
);
refuses("a legacy service_role key in the public slot is refused", () =>
  assertKeyFitsSlot(jwtKey("service_role", DEV_REF), "public", "public key", DEV_REF)
);
refuses("a legacy JWT from ANOTHER project is refused", () =>
  assertKeyFitsSlot(jwtKey("anon", OTHER_REF), "public", "public key", DEV_REF)
);
refuses("a Production service_role key is refused outright", () =>
  assertKeyFitsSlot(
    jwtKey("service_role", PRODUCTION_SUPABASE_REF),
    "elevated",
    "server key",
    DEV_REF
  )
);
refuses("an unrecognisable key is refused", () =>
  assertKeyFitsSlot("not-a-key", "public", "public key", DEV_REF)
);
refuses("an empty key is refused", () =>
  assertKeyFitsSlot("", "elevated", "server key", DEV_REF)
);

/**
 * The live probe must never turn "I could not ask" into "the key is fine".
 * Port 9 is the discard port: nothing answers, so this exercises the
 * unreachable path without touching any real project.
 */
async function unreachableChecks(): Promise<void> {
  checks += 1;
  const result = await probeSupabaseKey("https://127.0.0.1:9", PUBLISHABLE, "tournaments", 1500);
  assert.equal(result.reachable, false, "an unreachable host must not read as authenticated");
  assert.equal(result.authenticated, false);

  checks += 1;
  const report = await preflightSupabaseKeys({
    supabaseUrl: "https://127.0.0.1:9",
    publicKey: PUBLISHABLE,
    elevatedKey: SECRET,
    expectedRef: DEV_REF,
  });
  assert.equal(report.unreachable, true, "an unreachable API must be reported as unverified");
  assert.equal(report.ok, false, "unverified must never be reported as ok");

  // REGRESSION. An egress proxy answered `403 Host not in allowlist` and a first
  // version of this code, looking only for a 401, scored two fabricated keys as
  // "authenticated" and let --check report success. Anything that is not
  // PostgREST proves nothing. This is the test that keeps that true.
  await withServer(
    (_req, res) => {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Host not in allowlist: example.supabase.co. Add this host to your egress settings.");
    },
    async (origin) => {
      checks += 1;
      const proxied = await probeSupabaseKey(origin, PUBLISHABLE, "tournaments", 2000);
      assert.equal(proxied.reachable, true, "the socket did answer");
      assert.equal(proxied.conclusive, false, "a non-PostgREST 403 proves nothing about the key");
      assert.equal(proxied.authenticated, false, "and must never read as authenticated");

      checks += 1;
      const gated = await preflightSupabaseKeys({
        supabaseUrl: origin,
        publicKey: PUBLISHABLE,
        elevatedKey: SECRET,
        expectedRef: DEV_REF,
      });
      assert.equal(gated.ok, false, "a gateway denial must fail the preflight");
      assert.equal(gated.unreachable, true, "and be reported as unverified, not as a bad key");
    }
  );

  // A genuine PostgREST rejection is conclusive: the key really is wrong.
  await withServer(
    (_req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Invalid API key", hint: "Double check your key." }));
    },
    async (origin) => {
      checks += 1;
      const rejected = await probeSupabaseKey(origin, SECRET, "contacts", 2000);
      assert.equal(rejected.conclusive, true, "PostgREST answered, so this is conclusive");
      assert.equal(rejected.authenticated, false, "and the key was rejected");
    }
  );

  // A key PostgREST accepts reads rows.
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ id: 1 }, { id: 2 }]));
    },
    async (origin) => {
      checks += 1;
      const ok = await probeSupabaseKey(origin, SECRET, "contacts", 2000);
      assert.equal(ok.authenticated, true);
      assert.equal(ok.conclusive, true);
      assert.equal(ok.rows, 2, "row count is what distinguishes an elevated key from a public one");
    }
  );
}

/** Run `body` against a throwaway localhost HTTP server, then close it. */
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  body: (origin: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

unreachableChecks().then(() => {
  console.log(`stage22 guard: ${checks} checks passed`);
  console.log(
    `  Production (${PRODUCTION_SUPABASE_REF}) refused in ${PRODUCTION_FORMS.length} distinct forms.`
  );
  console.log(`  API keys: shape, slot fit and wrong-project rejection covered;`);
  console.log(`  an unreachable API is reported as UNVERIFIED, never as passing.`);
});
