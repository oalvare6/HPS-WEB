/**
 * Stage 2.2 — automated acceptance run against the real `hps-dev` database.
 *
 * This is the half of Stage 2.2 that could not be done from the remote session:
 * it drives the Stage 2.1 admin's own HTTP routes against real data, so what is
 * being tested is the application — its auth, its queries, its embeds and its
 * roster arithmetic — not the database it happens to sit on.
 *
 * The distinction matters. Every check below was already proved in SQL against
 * hps-dev. Passing here proves something different and stronger: that the app
 * reports the same answer the database holds. A PGRST201 ambiguous-embed error,
 * a broken admin cookie or a roster route that miscounts `waived` would all pass
 * the SQL checks and fail here.
 *
 * Prerequisites, in order:
 *   1. npx tsx scripts/stage22-setup-env.ts     (writes .env.stage22.local)
 *   2. npx tsx scripts/stage22-dev.ts           (leave it running, :3022)
 *   3. npx tsx scripts/stage22-verify-local.ts  (this file, in a second terminal)
 *
 * Exits non-zero if any check fails, so it can gate a commit.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Stage22GuardError, assertStage22Target, loadEnvFile } from "./stage22-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN_SLUG = "stage22-main-cup";
const EMPTY_SLUG = "stage22-empty-cup";
const OVERLAP_SLUG = "stage22-overlap-cup";

interface RosterRow {
  id: string;
  role: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  teamName: string | null;
  waiverOk: boolean;
  waiverEvidence: string;
  paid: boolean;
  paymentStatus: string;
  needsReview: boolean;
}
interface RosterTotals {
  signedUp: number;
  paid: number;
  unpaid: number;
  waiverOnFile: number;
  waiverMissing: number;
  guests: number;
  unassigned: number;
  payingCash: number;
}
interface RosterPayload {
  rows: RosterRow[];
  teams: Array<{ id: string; name: string }>;
  totals: RosterTotals;
}

let passed = 0;
const failures: string[] = [];

/**
 * Read an array out of a JSON envelope, or say plainly that the contract moved.
 *
 * This exists because of a real failure. The verifier assumed
 * `/api/admin/tournaments` returned a bare array; it actually returns
 * `{ tournaments: [...] }`. The optional-chaining fallback quietly produced an
 * empty list, and the run reported "event present: stage22-main-cup — FAIL"
 * four times over. Every row was in the database the whole time.
 *
 * A verifier that reports its own parse bug as missing data is worse than no
 * verifier: it sends you to look for a problem that does not exist, and it
 * would just as happily report a real regression as a shape change. So an
 * unexpected payload is now a loud, specific error naming the keys that did
 * arrive — never a silent empty array.
 */
function readArray<T>(body: unknown, key: string, label: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value as T[];
    const keys = Object.keys(body as Record<string, unknown>);
    throw new Stage22GuardError(
      `${label}: expected an array at "${key}", but the response had ` +
        `${keys.length ? `keys [${keys.join(", ")}]` : "no keys"}. ` +
        `The route contract changed — fix this verifier rather than the data.`
    );
  }
  throw new Stage22GuardError(
    `${label}: expected a JSON object containing "${key}", got ${typeof body}.`
  );
}

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? `  — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

async function main(): Promise<void> {
  const envFile =
    process.env.HPS_STAGE22_ENV_FILE?.trim() || path.join(ROOT, ".env.stage22.local");
  const values = loadEnvFile(envFile);

  // Never run this against anything but the approved development project.
  const ref = assertStage22Target({
    expectedRef: values.HPS_DEV_PROJECT_REF,
    candidates: [
      { label: "NEXT_PUBLIC_SUPABASE_URL", value: values.NEXT_PUBLIC_SUPABASE_URL, required: true },
    ],
  });

  const base = values.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3022";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
    throw new Stage22GuardError(`Refusing to test a non-local site: ${base}`);
  }

  console.log(`Stage 2.2 acceptance run`);
  console.log(`  app     ${base}`);
  console.log(`  project ${ref}`);

  // --- Reachability ------------------------------------------------------
  try {
    await fetch(`${base}/api/admin/me`);
  } catch {
    throw new Stage22GuardError(
      `Nothing is answering on ${base}. Start it first:  npx tsx scripts/stage22-dev.ts`
    );
  }

  // --- Authentication ----------------------------------------------------
  section("Authentication");
  const anonRoster = await fetch(`${base}/api/admin/tournaments`);
  check(
    "an unauthenticated caller cannot read admin data",
    anonRoster.status === 401,
    `HTTP ${anonRoster.status} (expected 401)`
  );

  const badLogin = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: values.ADMIN_USER, password: "wrong-password" }),
  });
  check("a wrong password is rejected", badLogin.status === 401, `HTTP ${badLogin.status}`);

  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: values.ADMIN_USER, password: values.ADMIN_PASSWORD }),
  });
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  check("admin sign-in succeeds and issues a session", login.ok && cookie.startsWith("admin_token="));
  if (!login.ok) throw new Stage22GuardError("Cannot continue without an admin session.");

  const auth = { headers: { cookie, "Content-Type": "application/json" } };
  const get = async <T>(url: string): Promise<{ status: number; body: T }> => {
    const res = await fetch(`${base}${url}`, auth);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error page */
    }
    return { status: res.status, body: body as T };
  };

  // --- Events ------------------------------------------------------------
  section("Events (the resolver every surface reads)");
  const events = await get<unknown>("/api/admin/tournaments");
  check("the admin event list loads", events.status === 200, `HTTP ${events.status}`);
  if (events.status !== 200) {
    throw new Stage22GuardError(
      `/api/admin/tournaments answered HTTP ${events.status}. Cannot continue.`
    );
  }
  // The route returns { tournaments: [...] } — verified against
  // src/app/api/admin/tournaments/route.ts, not assumed.
  const list = readArray<{ id: string; slug: string; title: string }>(
    events.body,
    "tournaments",
    "/api/admin/tournaments"
  );
  check("the event list is a populated array", list.length > 0, `${list.length} event(s)`);
  const bySlug = new Map(list.map((e) => [e.slug, e]));
  for (const slug of [MAIN_SLUG, EMPTY_SLUG, OVERLAP_SLUG, "stage22-open-play"]) {
    check(`event present: ${slug}`, bySlug.has(slug));
  }
  const main = bySlug.get(MAIN_SLUG);
  const empty = bySlug.get(EMPTY_SLUG);
  if (!main || !empty) throw new Stage22GuardError("Seeded events are missing; re-run the seed.");

  // --- The roster contract ----------------------------------------------
  section("Roster: the documented 12-player split, read through the app");
  const roster = await get<RosterPayload>(`/api/admin/tournaments/${main.id}/roster`);
  check("the roster route answers", roster.status === 200, `HTTP ${roster.status}`);
  const t = roster.body?.totals;
  if (!t) throw new Stage22GuardError("The roster route returned no totals.");

  check("signed up = 12", t.signedUp === 12, `got ${t.signedUp}`);
  check(
    "financially accounted for = 7  (5 paid + 2 waived/free)",
    t.paid === 7,
    `got ${t.paid}`
  );
  check("outstanding = 5", t.unpaid === 5, `got ${t.unpaid}`);
  check("unassigned = 4", t.unassigned === 4, `got ${t.unassigned}`);
  check(
    "waived/free counts equally with paid — no half-paid threshold appears",
    t.paid + t.unpaid === t.signedUp,
    `${t.paid} + ${t.unpaid} = ${t.signedUp}`
  );

  const rows = roster.body.rows ?? [];
  const byStatus = (s: string) => rows.filter((r) => r.paymentStatus === s).length;
  check("5 paid", byStatus("paid") === 5, `got ${byStatus("paid")}`);
  check("2 waived", byStatus("waived") === 2, `got ${byStatus("waived")}`);
  check("3 pending", byStatus("pending") === 3, `got ${byStatus("pending")}`);
  check(
    "1 partial, still separately identifiable",
    byStatus("partial") === 1,
    `got ${byStatus("partial")}`
  );
  check(
    "1 refunded, still separately identifiable",
    byStatus("refunded") === 1,
    `got ${byStatus("refunded")}`
  );
  check(
    "the five outstanding are NOT all 'never paid'",
    byStatus("pending") === 3 && byStatus("partial") + byStatus("refunded") === 2
  );
  check("one review flag, and the payload carries no invented reason", rows.filter((r) => r.needsReview).length === 1);

  // --- Waivers -----------------------------------------------------------
  section("Waiver evidence (one computation, one display policy)");
  const covered = rows.filter((r) => r.waiverOk).length;
  check("10 covered, 2 genuinely missing", covered === 10, `got ${covered} covered`);
  check(
    "expired coverage reads as missing, not covered",
    rows.some((r) => r.firstName === "Player9" && !r.waiverOk)
  );
  check(
    "legacy evidence with no document is COVERED, not 'needs waiver'",
    rows.some((r) => r.firstName === "Player10" && r.waiverOk),
    "the operator's 2026-08-17 policy: a covered person is a tick whatever the paper trail"
  );
  check(
    "an admin override reads as covered with evidence 'override'",
    rows.some((r) => r.firstName === "Player11" && r.waiverOk && r.waiverEvidence === "override")
  );
  check("waiverOnFile + waiverMissing = signedUp", t.waiverOnFile + t.waiverMissing === t.signedUp,
    `${t.waiverOnFile} + ${t.waiverMissing} = ${t.signedUp}`);

  // --- Empty vs failed ---------------------------------------------------
  section("Empty is not the same as failed");
  const emptyRoster = await get<RosterPayload>(`/api/admin/tournaments/${empty.id}/roster`);
  check("the empty event returns 200, not an error", emptyRoster.status === 200, `HTTP ${emptyRoster.status}`);
  check("its roster is genuinely empty", (emptyRoster.body?.rows ?? []).length === 0);
  check("its totals are zero rather than absent", emptyRoster.body?.totals?.signedUp === 0);

  // --- Identity across events -------------------------------------------
  section("The same person in two events");
  const overlap = bySlug.get(OVERLAP_SLUG);
  if (overlap) {
    const o = await get<RosterPayload>(`/api/admin/tournaments/${overlap.id}/roster`);
    const oRows = o.body?.rows ?? [];
    const mainP1 = rows.find((r) => r.firstName === "Player1");
    const overP1 = oRows.find((r) => r.firstName === "Player1");
    check("Player1 appears in both events", Boolean(mainP1 && overP1));
    check(
      "…as two DIFFERENT registrations, distinguishable by id",
      Boolean(mainP1 && overP1 && mainP1.id !== overP1.id),
      mainP1 && overP1 ? `${mainP1.id.slice(0, 8)} vs ${overP1.id.slice(0, 8)}` : ""
    );
  }

  // --- Schedule, standings, scorers -------------------------------------
  section("Schedule and score math");
  const stats = await get<{
    registrantCount?: number;
    paidRegistrantCount?: number;
    paymentCount?: number;
    paymentTotalCents?: number;
    currency?: string;
  }>(`/api/admin/tournaments/${main.id}/stats`);
  check("the stats route answers", stats.status === 200, `HTTP ${stats.status}`);
  const s = stats.body ?? {};
  check("stats: 12 people are coming", s.registrantCount === 12, `got ${s.registrantCount}`);
  // Deliberately different from the roster's 7. This endpoint counts
  // payment_status = 'paid' only; the roster counts paid + waived. Asserting
  // both is what would catch the two being conflated.
  check(
    "stats: 5 have paid (this count excludes waived, unlike the roster's 7)",
    s.paidRegistrantCount === 5,
    `got ${s.paidRegistrantCount}`
  );
  check("stats: 5 succeeded payment rows", s.paymentCount === 5, `got ${s.paymentCount}`);
  check(
    "stats: $250.00 recorded",
    s.paymentTotalCents === 25000,
    `got ${s.paymentTotalCents} cents`
  );

  const matches = await get<unknown>(`/api/admin/tournaments/${main.id}/matches`);
  check("the schedule loads", matches.status === 200, `HTTP ${matches.status}`);
  // Returns { matches: [...] } — verified against the route.
  const mList = readArray<{
    status: string;
    home_score: number | null;
    away_score: number | null;
    match_number: number | null;
  }>(matches.body, "matches", "/api/admin/tournaments/[id]/matches");
  check("six fixtures are present", mList.length === 6, `got ${mList.length}`);
  check(
    "the 2-1 result is what the app reports",
    mList.some(
      (m) =>
        m.match_number === 1 && m.status === "completed" && m.home_score === 2 && m.away_score === 1
    )
  );
  check("a postponed fixture survives as postponed", mList.some((m) => m.status === "postponed"));
  check("a cancelled fixture survives as cancelled", mList.some((m) => m.status === "cancelled"));
  check("an undated fixture is allowed", mList.some((m) => m.match_number === 5));

  // --- Cross-event integrity through the ROUTE ---------------------------
  // The database has no constraint forbidding a team from another event; the
  // admin API is the only enforcement point, which is exactly why this must be
  // tested here rather than in SQL.
  section("Cross-event integrity (enforced by the API, not the database)");
  const overlapEvent = bySlug.get(OVERLAP_SLUG);
  if (overlapEvent) {
    const overlapRoster = await get<RosterPayload>(
      `/api/admin/tournaments/${overlapEvent.id}/roster`
    );
    // The pairing is the whole point: a registration in the OVERLAP event, and a
    // team belonging to the MAIN event. Patching a main-event registration with
    // a main-event team is not cross-event at all, and would pass for the wrong
    // reason — which is what an earlier version of this check did.
    const mainTeam = (roster.body.teams ?? [])[0];
    const overlapPlayer = (overlapRoster.body?.rows ?? []).find((r) => r.role === "player");

    if (mainTeam && overlapPlayer) {
      const res = await fetch(`${base}/api/admin/registrations/${overlapPlayer.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: mainTeam.id }),
      });
      const refused = res.status >= 400;
      check(
        "a team from another event is refused",
        refused,
        `${overlapEvent.slug} registration + ${MAIN_SLUG} team → HTTP ${res.status} (expected 4xx)`
      );
      if (!refused) {
        // It should never get here, but if the guard is gone the seed must not
        // be left corrupted by this test.
        await fetch(`${base}/api/admin/registrations/${overlapPlayer.id}`, {
          method: "PATCH",
          headers: { cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: null }),
        });
        console.log("  NOTE  the assignment was accepted and has been reverted.");
      }
    } else {
      console.log("  SKIP  need a main-event team and an overlap-event player to test with");
    }
  }

  // --- Result ------------------------------------------------------------
  console.log(`\n${"-".repeat(64)}`);
  if (failures.length === 0) {
    console.log(`Stage 2.2 acceptance: ${passed}/${passed} checks passed against ${ref}.`);
    console.log(`The Stage 2.1 admin agrees with the real database.`);
  } else {
    console.log(`Stage 2.2 acceptance: ${passed} passed, ${failures.length} FAILED against ${ref}.`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof Stage22GuardError) {
    console.error(`\nStage 2.2 refused.\n\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
});
