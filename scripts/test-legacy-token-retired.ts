/**
 * Stage 1.3 MGT-01 — the 90-day HMAC pay-resume token is gone. Tests 16–24 of
 * the stage spec.
 *
 * Two kinds of proof:
 *
 *   structural — the generator, the verifier, the URL builder, every route
 *     that accepted the token and the script that minted one no longer exist,
 *     and no source line reads a `payToken`;
 *
 *   behavioural — a token in the retired shape, presented anywhere a consumer
 *     used to read it, is refused by every handler that replaced those
 *     consumers, and the new registration-bound session is scoped to exactly
 *     one registration.
 *
 * The signing key used to build the legacy-shaped fixture is a throwaway
 * string in this file. It is not a production value.
 *
 * Run: npx tsx scripts/test-legacy-token-retired.ts
 */
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as appSigning from "../src/lib/app-signing";
import {
  authenticateResumeSession,
  exchangeResumeToken,
  hashSecret,
  issueRegistrationSession,
  looksLikeRawSecret,
  sessionAllows,
  IN_APP_WAIVER_SCOPE,
  RESUME_SCOPES,
  RESUME_SESSION_TTL_SECONDS,
} from "../src/lib/resume-access";
import {
  handleResumeCancel,
  handleResumeCheckout,
  handleResumeExchange,
  handleResumePaymentMethod,
  handleResumeWaiverSign,
  handleResumeWaiverStart,
  RESUME_PAGE_PATH,
  RESUME_WAIVER_PAGE_PATH,
  type ResumeRouteDeps,
} from "../src/lib/resume-routes";
import { RESUME_COOKIE_NAME, RESUME_COOKIE_PATH, serializeResumeCookie } from "../src/lib/resume-session";
import { CapturingSender, Harness, InMemoryResumeStore, RecordingOps } from "./_test-fakes";

const t = new Harness();
const ROOT = path.join(__dirname, "..");
const SITE = "https://www.example.com";
const REG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/* ------------------------------------------------------------------ */
/* The retired shape, rebuilt from git history for the fixture only     */
/* ------------------------------------------------------------------ */

const THROWAWAY_KEY = "test-only-legacy-key-not-a-real-secret";

/** `<base64url({rid, exp})>.<hex HMAC-SHA256("pay:v1:" + inner)>` — 90 days. */
function legacyToken(registrationId: string, key = THROWAWAY_KEY, expMs = Date.now() + 90 * 24 * 3600 * 1000): string {
  const inner = Buffer.from(JSON.stringify({ rid: registrationId, exp: expMs }), "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(`pay:v1:${inner}`).digest("hex");
  return `${inner}.${sig}`;
}

/* ------------------------------------------------------------------ */
/* Source scanning                                                      */
/* ------------------------------------------------------------------ */

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      listSources(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Lines that are code, not comments (good enough for `//` and `/* *` blocks). */
function codeLines(src: string): string[] {
  const lines: string[] = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (line.startsWith("//") || line.startsWith("*")) continue;
    lines.push(line.replace(/\/\/.*$/, ""));
  }
  return lines;
}

function post(path_: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path_}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "www.example.com", origin: SITE, ...headers },
    body: JSON.stringify(body),
  });
}

async function main() {
  // Application code, plus every script that is not itself a test or a static
  // verifier: those name the retired identifiers as negative fixtures
  // ("must NOT appear"), which is the opposite of a consumer.
  const sources = [
    ...listSources(path.join(ROOT, "src")),
    ...listSources(path.join(ROOT, "scripts")).filter((p) => !/^(test-|verify-|_test)/.test(path.basename(p))),
    path.join(ROOT, "next.config.ts"),
  ].filter((p) => fs.existsSync(p));

  /* ---------------- Tests 16 & 24: no generator, no consumer, no minting script ---------------- */
  {
    const exported = Object.keys(appSigning).sort();
    t.eq("16/24. lib/app-signing.ts exports only the admin-cookie functions", exported, ["getAppSigningSecret", "signAdminSessionCookieValue", "verifyAdminSessionCookieValue"]);
    t.check("24. no createPayResumeToken anywhere", !("createPayResumeToken" in appSigning));
    t.check("24b. no verifyPayResumeToken anywhere", !("verifyPayResumeToken" in appSigning));

    const forbidden: Array<[string, RegExp]> = [
      ["createPayResumeToken", /createPayResumeToken/],
      ["verifyPayResumeToken", /verifyPayResumeToken/],
      ["the pay:v1 HMAC domain", /pay:v1/],
      ["PAY_RESUME_MS", /PAY_RESUME_MS/],
      ["buildPayResumeUrl / buildPayResumePath / buildWaiverSignPath", /buildPayResume(Url|Path)|buildWaiverSignPath/],
      ["lib/pay-resume-url import", /pay-resume-url/],
      ["a payToken read in code", /payToken/],
    ];
    for (const [label, re] of forbidden) {
      const hits = sources.filter((p) => codeLines(fs.readFileSync(p, "utf8")).some((l) => re.test(l)));
      t.eq(`24c. no source line references ${label}`, hits.map((p) => path.relative(ROOT, p)), []);
    }

    const gone = [
      "src/lib/pay-resume-url.ts",
      "src/app/api/registrations/[id]/route.ts",
      "src/app/api/register/payment-intent/route.ts",
      "src/app/api/register/captain-paid-ack/route.ts",
      "src/app/api/waiver/sign/route.ts",
      "src/app/api/stripe/checkout/route.ts",
      "src/app/api/pay/options/route.ts",
      "src/components/pay/PayForm.tsx",
      "src/components/pay/EnrolledPanels.tsx",
      "scripts/_mint-pay-token.ts",
    ];
    for (const rel of gone) {
      t.check(`24d. former consumer removed: ${rel}`, !fs.existsSync(path.join(ROOT, rel)));
    }

    // The register route mints a session, never a token, and lands on a clean URL.
    const register = fs.readFileSync(path.join(ROOT, "src/app/api/register/route.ts"), "utf8");
    t.check("16b. /api/register issues a registration session", /issueRegistrationSession\(/.test(register));
    t.check("16c. /api/register sets the resume cookie", /serializeResumeCookie\(/.test(register));
    t.check("16d. /api/register never imports app-signing", !/app-signing/.test(register));
    t.check("16e. /api/register's DocuSeal return URL is the clean resume page", /resumeSignedRedirectUrl\(/.test(register));
    const join = fs.readFileSync(path.join(ROOT, "src/app/api/register/join/route.ts"), "utf8");
    t.check("16f. /api/register/join never imports app-signing", !/app-signing/.test(join));
    const adminSign = fs.readFileSync(path.join(ROOT, "src/app/api/admin/registrations/[id]/sign-waiver/route.ts"), "utf8");
    t.check("16g. admin in-person signing mints a scoped session, not a token", /issueRegistrationSession\(/.test(adminSign) && !/app-signing/.test(adminSign));
    const payPage = fs.readFileSync(path.join(ROOT, "src/app/pay/page.tsx"), "utf8");
    t.check("20a. /pay no longer reads registrationId/payToken from the URL", !codeLines(payPage).some((l) => /registrationId|payToken|app-signing/.test(l)));
    const waiverPage = fs.readFileSync(path.join(ROOT, "src/app/register/waiver/[registrationId]/page.tsx"), "utf8");
    t.check("20b. /register/waiver/[id] no longer accepts a token; it checks the signed-in owner", !codeLines(waiverPage).some((l) => /payToken|app-signing/.test(l)) && /getCurrentPlayer\(/.test(waiverPage));
    const registerPage = fs.readFileSync(path.join(ROOT, "src/app/register/page.tsx"), "utf8");
    t.check("20c. /register no longer mints tokens for its status cards", !/app-signing|createPayResumeToken/.test(registerPage));
  }

  /* ---------------- Test 17: the registration-bound session ---------------- */
  {
    const store = new InMemoryResumeStore();
    const issued = await issueRegistrationSession(store, { registrationId: REG_A, scopes: RESUME_SCOPES });
    t.eq("17. the session is bound to the registration just created", issued.registrationId, REG_A);
    t.check("17b. the secret is a 256-bit raw secret", looksLikeRawSecret(issued.sessionSecret));
    t.check("17c. only the hash is stored", store.sessionFor(hashSecret(issued.sessionSecret)) !== null && store.sessionFor(issued.sessionSecret) === null);
    t.check("17d. the secret does not encode the registration id", !Buffer.from(issued.sessionSecret, "base64url").toString("utf8").includes(REG_A.slice(0, 8)));
    t.check("17e. the session has no access token behind it (no magic link was involved)", store.sessionFor(hashSecret(issued.sessionSecret))!.accessTokenId === null);
    t.check("17f. 24-hour lifetime, same as a magic-link session", issued.maxAgeSeconds > RESUME_SESSION_TTL_SECONDS - 5 && issued.maxAgeSeconds <= RESUME_SESSION_TTL_SECONDS);

    const session = await authenticateResumeSession(store, issued.sessionSecret);
    t.check("17g. the cookie value authenticates to that registration", session !== null && session.registrationId === REG_A);
    t.eq("17h. scopes are exactly the resume scopes", [...(session?.scopes ?? [])].sort(), [...RESUME_SCOPES].sort());
    t.check("17i. no waiver:sign unless asked", !session?.scopes.has(IN_APP_WAIVER_SCOPE));

    const cookie = serializeResumeCookie(issued.sessionSecret, issued.maxAgeSeconds);
    t.check("17j. cookie is HttpOnly, SameSite=Lax, on the narrow path", /HttpOnly/.test(cookie) && /SameSite=Lax/.test(cookie) && cookie.includes(`Path=${RESUME_COOKIE_PATH}`));
    t.check("17k. cookie carries no registration id", !cookie.includes(REG_A));
    t.eq("17l. cookie name", cookie.split("=")[0], RESUME_COOKIE_NAME);

    const clean = [RESUME_PAGE_PATH, `${RESUME_PAGE_PATH}?registered=1`, `${RESUME_PAGE_PATH}?signed=1`, RESUME_WAIVER_PAGE_PATH];
    for (const url of clean) {
      t.check(`17m. post-registration URL is clean: ${url}`, !/token|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(url));
    }

    const inApp = await issueRegistrationSession(store, { registrationId: REG_B, scopes: [...RESUME_SCOPES, IN_APP_WAIVER_SCOPE] });
    const inAppSession = await authenticateResumeSession(store, inApp.sessionSecret);
    t.check("17n. the in-app fallback session carries waiver:sign, and only when asked", inAppSession?.scopes.has(IN_APP_WAIVER_SCOPE) === true);

    store.failNext = "createSession";
    let threw = false;
    try {
      await issueRegistrationSession(store, { registrationId: REG_A, scopes: RESUME_SCOPES });
    } catch {
      threw = true;
    }
    t.check("17o. a store failure surfaces (the route logs it; the registration still stands)", threw);
  }

  /* ---------------- Test 18: one registration only ---------------- */
  {
    const store = new InMemoryResumeStore();
    const a = await issueRegistrationSession(store, { registrationId: REG_A, scopes: RESUME_SCOPES });
    const session = (await authenticateResumeSession(store, a.sessionSecret))!;
    for (const scope of RESUME_SCOPES) {
      t.check(`18. A's session allows ${scope} on A`, sessionAllows(session, scope, REG_A));
      t.check(`18b. A's session refuses ${scope} on B`, !sessionAllows(session, scope, REG_B));
    }
    t.check("18c. waiver:sign refused on the registration itself when not granted", !sessionAllows(session, IN_APP_WAIVER_SCOPE, REG_A));

    // Through the handlers: a body naming B is ignored.
    const ops = new RecordingOps();
    ops.add(REG_A, { waiverSigned: false });
    ops.add(REG_B, { waiverSigned: false });
    const deps: ResumeRouteDeps = { store, sender: new CapturingSender(), ops, baseUrl: SITE, siteUrl: SITE };
    const cookie = { cookie: `${RESUME_COOKIE_NAME}=${encodeURIComponent(a.sessionSecret)}` };
    await handleResumeCheckout(post("/pay/resume/api/checkout", { registrationId: REG_B }, cookie), deps);
    await handleResumePaymentMethod(post("/pay/resume/api/payment-method", { registrationId: REG_B, method: "cash" }, cookie), deps);
    await handleResumeWaiverStart(post("/pay/resume/api/waiver", { registrationId: REG_B }, cookie), deps);
    await handleResumeCancel(post("/pay/resume/api/cancel", { registrationId: REG_B }, cookie), deps);
    t.check("18d. every handler acted on A only", ops.calls.length > 0 && ops.calls.every((c) => c.registrationId === REG_A));
    t.eq("18e. B untouched", ops.registrations.get(REG_B)!.cancelledAt, null);
  }

  /* ---------------- Tests 19–23: the legacy shape is refused everywhere ---------------- */
  {
    const store = new InMemoryResumeStore();
    const ops = new RecordingOps();
    ops.add(REG_A, { waiverSigned: false });
    const deps: ResumeRouteDeps = { store, sender: new CapturingSender(), ops, baseUrl: SITE, siteUrl: SITE };
    const token = legacyToken(REG_A);
    t.check("fixture: the legacy shape is not a raw session secret", !looksLikeRawSecret(token));

    const consumers = [
      ["registration read (checkout probe)", handleResumeCheckout, "/pay/resume/api/checkout", {}],
      ["payment start", handleResumeCheckout, "/pay/resume/api/checkout", {}],
      ["cash declaration", handleResumePaymentMethod, "/pay/resume/api/payment-method", { method: "cash" }],
      ["cancellation", handleResumeCancel, "/pay/resume/api/cancel", {}],
      ["waiver start", handleResumeWaiverStart, "/pay/resume/api/waiver", {}],
      ["waiver completion", handleResumeWaiverSign, "/pay/resume/api/waiver-sign", { signedName: "Alice Example" }],
    ] as const;

    for (const [label, handler, path_, body] of consumers) {
      const asCookie = await handler(post(path_, body, { cookie: `${RESUME_COOKIE_NAME}=${encodeURIComponent(token)}` }), deps);
      t.eq(`19/21/22/23. legacy token as the session cookie → ${label} refused (401)`, asCookie.status, 401);
      const inBody = await handler(post(path_, { ...body, payToken: token, token, registrationId: REG_A }), deps);
      t.eq(`19b. legacy token in the body → ${label} refused (401)`, inBody.status, 401);
      const inQuery = await handler(new Request(`${SITE}${path_}?payToken=${encodeURIComponent(token)}&registrationId=${REG_A}`, { method: "POST", headers: { "content-type": "application/json", host: "www.example.com", origin: SITE }, body: JSON.stringify(body) }), deps);
      t.eq(`19c. legacy token in the query → ${label} refused (401)`, inQuery.status, 401);
    }
    t.eq("19d. no consumer reached the ops", ops.calls.length, 0);
    const r = ops.registrations.get(REG_A)!;
    t.check("21/22/23. nothing started, declared, cancelled or signed", r.cancelledAt === null && r.paymentMethod === null && !r.waiverSigned && !r.waiverCompletedDirectly);
    t.eq("19e. the store holds no session for the token", store.sessionFor(hashSecret(token)), null);

    // An unexpired token signed with a *matching* key is no better: nothing verifies it any more.
    const nothingToMatch = await handleResumeCheckout(post("/pay/resume/api/checkout", {}, { cookie: `${RESUME_COOKIE_NAME}=${encodeURIComponent(legacyToken(REG_A, process.env.APP_SIGNING_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? THROWAWAY_KEY))}` }), deps);
    t.eq("19f. even a token under the app's own signing secret → 401 (no verifier exists)", nothingToMatch.status, 401);
  }

  /* ---------------- Test 20 & 21: old links fail securely; no conversion path ---------------- */
  {
    const store = new InMemoryResumeStore();
    store.registrations.set(REG_A, { id: REG_A, email: "alice@example.com", tournamentTitle: "Cup", tournament: null });
    const deps: ResumeRouteDeps = { store, sender: new CapturingSender(), ops: new RecordingOps(), baseUrl: SITE, siteUrl: SITE };

    // The only place a browser can present a credential for exchange.
    store.failNext = "*";
    const existing = await handleResumeExchange(post("/pay/resume/api/exchange", { token: legacyToken(REG_A) }), deps);
    t.eq("20. legacy token for an EXISTING registration → 303 to the malformed-link page", existing.headers.get("location"), "/pay/resume?link=malformed");
    t.eq("20b. ...the store was never consulted (a failing store did not fail the request)", store.failNext, "*");
    store.failNext = "*";
    const missing = await handleResumeExchange(post("/pay/resume/api/exchange", { token: legacyToken("00000000-0000-4000-8000-000000000000") }), deps);
    t.eq("20c. legacy token for a NONEXISTENT registration → identical answer", missing.headers.get("location"), existing.headers.get("location"));
    t.eq("20d. identical status", missing.status, existing.status);
    t.check("20e. no cookie set either way", existing.headers.get("set-cookie") === null && missing.headers.get("set-cookie") === null);
    store.failNext = null;

    // The primitive itself: a legacy shape never reaches the store, so it can never become a session.
    store.failNext = "*";
    const ex = await exchangeResumeToken(store, legacyToken(REG_A));
    t.eq("21. exchangeResumeToken(legacy shape) → malformed", ex.ok === false ? ex.reason : "ok", "malformed");
    t.eq("21b. ...without touching the store (no conversion path)", store.failNext, "*");
    t.eq("21c. no session minted", store.sessions.size, 0);
    store.failNext = null;

    // The interstitial refuses the shape before rendering a form (structural).
    const page = fs.readFileSync(path.join(ROOT, "src/app/pay/resume/exchange/page.tsx"), "utf8");
    t.check("20f. the interstitial only renders a form for a raw-secret-shaped token", /looksLikeRawSecret\(t\)/.test(page));
  }

  /* ---------------- Secret dependency ---------------- */
  {
    const users = sources
      .filter((p) => codeLines(fs.readFileSync(p, "utf8")).some((l) => /from "@\/lib\/app-signing"/.test(l)))
      .map((p) => path.relative(ROOT, p))
      .sort();
    t.eq("the signing secret module is imported only by the admin cookie code", users, ["src/lib/admin-auth.ts", "src/lib/admin-session.ts"]);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
