/**
 * Runs the real Stage 2.2 verifier against a stub that speaks the real route
 * contracts, and proves two things:
 *
 *   1. Given the seeded data, the verifier passes.
 *   2. Given a payload whose SHAPE has drifted, it fails loudly with a contract
 *      error — it does not report the data as missing.
 *
 * Point 2 is why this file exists. The verifier assumed `/api/admin/tournaments`
 * returned a bare array; it actually returns `{ tournaments: [...] }`. The
 * fallback produced an empty list and the run reported four seeded events as
 * missing, sending someone to look for a data problem that never existed. A
 * verifier that misreports its own parse bug is worse than no verifier at all.
 *
 * The payload shapes below are copied from the routes, not guessed:
 *   tournaments  -> { tournaments: [...] }   src/app/api/admin/tournaments/route.ts
 *   roster       -> { rows, teams, totals }  .../[id]/roster/route.ts
 *   stats        -> { registrantCount, paidRegistrantCount, paymentCount,
 *                     paymentTotalCents, currency }
 *   matches      -> { matches: [...] }       .../[id]/matches/route.ts
 *
 * Run: npx tsx scripts/test-stage22-verify-contract.ts
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_REF = "tfkdtwgxnumnuiiayrld";
const ADMIN_USER = "hps-stage22";
const ADMIN_PASSWORD = "stub-password";

const MAIN = "11111111-1111-4111-8111-111111111111";
const EMPTY = "22222222-2222-4222-8222-222222222222";
const OVERLAP = "33333333-3333-4333-8333-333333333333";
const OPEN_PLAY = "44444444-4444-4444-8444-444444444444";
const TEAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function tournaments() {
  return [
    { id: MAIN, slug: "stage22-main-cup", title: "stage22 Main Cup" },
    { id: EMPTY, slug: "stage22-empty-cup", title: "stage22 Empty Cup" },
    { id: OVERLAP, slug: "stage22-overlap-cup", title: "stage22 Overlap Cup" },
    { id: OPEN_PLAY, slug: "stage22-open-play", title: "stage22 Open Play" },
  ];
}

/** The seeded roster: 5 paid, 2 waived, 3 pending, 1 partial, 1 refunded. */
function mainRows() {
  const status = (i: number) =>
    i <= 5 ? "paid" : i <= 7 ? "waived" : i <= 10 ? "pending" : i === 11 ? "partial" : "refunded";
  return Array.from({ length: 12 }, (_, idx) => {
    const i = idx + 1;
    // Waiver coverage mirrors the seed: 1-8 signed, 9 expired, 10 imported with
    // no document, 11 override, 12 none.
    const waiverOk = i <= 8 || i === 10 || i === 11;
    const evidence = i === 11 ? "override" : waiverOk ? "signed" : "none";
    return {
      id: `reg-main-${i}`,
      role: "player",
      firstName: `Player${i}`,
      lastName: "Synthetic",
      teamId: i <= 4 ? TEAM_A : i <= 8 ? TEAM_B : null,
      teamName: i <= 4 ? "stage22 Rojos" : i <= 8 ? "stage22 Azules" : null,
      waiverOk,
      waiverEvidence: evidence,
      paid: status(i) === "paid" || status(i) === "waived",
      paymentStatus: status(i),
      needsReview: i === 10,
    };
  });
}

function totalsFor(rows: ReturnType<typeof mainRows>) {
  return {
    signedUp: rows.length,
    paid: rows.filter((r) => r.paid).length,
    unpaid: rows.filter((r) => !r.paid).length,
    waiverOnFile: rows.filter((r) => r.waiverOk).length,
    waiverMissing: rows.filter((r) => !r.waiverOk).length,
    guests: 0,
    unassigned: rows.filter((r) => r.teamId === null).length,
    payingCash: 0,
  };
}

interface StubOptions {
  /** Return a bare array instead of the envelope. Still readable — must pass. */
  bareArrayTournaments?: boolean;
  /** Rename the envelope key. Genuinely unreadable — must fail as a contract error. */
  renamedTournamentsKey?: boolean;
}

function handler(opts: StubOptions) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    const authed = (req.headers.cookie ?? "").includes("admin_token=");

    if (url.pathname === "/api/admin/login" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as { username?: string; password?: string };
        if (body.username === ADMIN_USER && body.password === ADMIN_PASSWORD) {
          json(200, { success: true }, { "Set-Cookie": "admin_token=stub.signature; Path=/; HttpOnly" });
        } else {
          json(401, { error: "Invalid username or password." });
        }
      });
      return;
    }

    if (url.pathname === "/api/admin/me") return json(authed ? 200 : 401, { ok: authed });

    if (!authed) return json(401, { error: "Unauthorized" });

    if (url.pathname === "/api/admin/tournaments") {
      // The real route returns an ENVELOPE, which is what the verifier used to
      // get wrong. A bare array stays readable; a renamed key does not.
      if (opts.renamedTournamentsKey) return json(200, { events: tournaments() });
      if (opts.bareArrayTournaments) return json(200, tournaments());
      return json(200, { tournaments: tournaments() });
    }

    const roster = /^\/api\/admin\/tournaments\/([^/]+)\/roster$/.exec(url.pathname);
    if (roster) {
      const id = roster[1];
      if (id === MAIN) {
        const rows = mainRows();
        return json(200, {
          rows,
          teams: [
            { id: TEAM_A, name: "stage22 Rojos", color: "#c0392b" },
            { id: TEAM_B, name: "stage22 Azules", color: "#2980b9" },
          ],
          totals: totalsFor(rows),
        });
      }
      if (id === OVERLAP) {
        const rows = mainRows()
          .slice(0, 2)
          .map((r, i) => ({ ...r, id: `reg-overlap-${i + 1}`, teamId: null, teamName: null }));
        return json(200, { rows, teams: [], totals: totalsFor(rows) });
      }
      return json(200, { rows: [], teams: [], totals: totalsFor([]) });
    }

    if (/^\/api\/admin\/tournaments\/[^/]+\/stats$/.test(url.pathname)) {
      return json(200, {
        registrantCount: 12,
        paidRegistrantCount: 5,
        paymentCount: 5,
        paymentTotalCents: 25000,
        currency: "usd",
      });
    }

    if (/^\/api\/admin\/tournaments\/[^/]+\/matches$/.test(url.pathname)) {
      return json(200, {
        matches: [
          { match_number: 1, status: "completed", home_score: 2, away_score: 1 },
          { match_number: 2, status: "completed", home_score: 1, away_score: 2 },
          { match_number: 3, status: "postponed", home_score: null, away_score: null },
          { match_number: 4, status: "cancelled", home_score: null, away_score: null },
          { match_number: 5, status: "scheduled", home_score: null, away_score: null },
          { match_number: 6, status: "scheduled", home_score: null, away_score: null },
        ],
      });
    }

    if (/^\/api\/admin\/registrations\/[^/]+$/.test(url.pathname) && req.method === "PATCH") {
      // The real route refuses a team belonging to another event.
      return json(400, { error: "That team belongs to a different event." });
    }

    return json(404, { error: "not found" });
  };
}

async function runVerifierAgainst(opts: StubOptions): Promise<{ code: number; output: string }> {
  const server = createServer(handler(opts));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const dir = mkdtempSync(path.join(tmpdir(), "hps-stage22-contract-"));
  const envFile = path.join(dir, "stub.env");
  writeFileSync(
    envFile,
    [
      `HPS_DEV_PROJECT_REF=${DEV_REF}`,
      `NEXT_PUBLIC_SUPABASE_URL=https://${DEV_REF}.supabase.co`,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_stub",
      "SUPABASE_SERVICE_ROLE_KEY=sb_secret_stub",
      `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${port}`,
      `ADMIN_USER=${ADMIN_USER}`,
      `ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      "APP_SIGNING_SECRET=stub-signing-secret-for-the-contract-test",
      "",
    ].join("\n")
  );

  try {
    return await new Promise((resolve) => {
      // tsx is not a project dependency — every call resolves it through npx —
      // so spawn through a shell, which also makes this work with npx.cmd on
      // the operator's Windows machine.
      const child = spawn("npx tsx scripts/stage22-verify-local.ts", {
        env: { ...process.env, HPS_STAGE22_ENV_FILE: envFile },
        cwd: ROOT,
        shell: true,
      });
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      child.on("close", (code) => resolve({ code: code ?? 0, output }));
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main(): Promise<void> {
  let checks = 0;

  // 1. The real contracts, with the seeded values: the verifier must pass.
  const good = await runVerifierAgainst({});
  checks += 1;
  assert.equal(
    good.code,
    0,
    `the verifier should pass against correct payloads, but exited ${good.code}:\n${good.output}`
  );
  checks += 1;
  assert.match(good.output, /checks passed against/, "it should report a clean run");
  checks += 1;
  assert.doesNotMatch(good.output, /FAIL/, `no check should fail:\n${good.output}`);
  for (const slug of [
    "stage22-main-cup",
    "stage22-empty-cup",
    "stage22-overlap-cup",
    "stage22-open-play",
  ]) {
    checks += 1;
    assert.match(good.output, new RegExp(`PASS  event present: ${slug}`), `${slug} should be found`);
  }

  // 2. A bare array is still readable, so it must still pass. Being strict
  //    about the envelope must not mean being brittle about the alternative.
  const bare = await runVerifierAgainst({ bareArrayTournaments: true });
  checks += 1;
  assert.equal(bare.code, 0, `a bare array is still readable and should pass:\n${bare.output}`);

  // 3. A renamed key is genuinely unreadable, and MUST be reported as a contract
  //    error — never as four missing events, which is what sent someone hunting
  //    for a data problem that did not exist.
  const drifted = await runVerifierAgainst({ renamedTournamentsKey: true });
  checks += 1;
  assert.notEqual(drifted.code, 0, "an unreadable payload must fail the run");
  checks += 1;
  assert.doesNotMatch(
    drifted.output,
    /FAIL  event present/,
    `a parse failure must NOT be reported as missing events:\n${drifted.output}`
  );
  checks += 1;
  assert.match(
    drifted.output,
    /route contract changed/,
    `it must name the real problem:\n${drifted.output}`
  );
  checks += 1;
  assert.match(drifted.output, /\[events\]/, "and name the keys that actually arrived");

  console.log(`stage22 verifier contract: ${checks} checks passed`);
  console.log(`  the real route envelopes are read correctly, and a changed`);
  console.log(`  payload shape is reported as a contract error, never as missing data.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
