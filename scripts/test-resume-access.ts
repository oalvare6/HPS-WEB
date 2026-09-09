/**
 * F-01 core: magic-link tokens and resume sessions, without a database.
 *
 * Run: npx tsx scripts/test-resume-access.ts
 */
import {
  authenticateResumeSession,
  exchangeResumeToken,
  generateSecret,
  hashSecret,
  requestResumeLink,
  sessionAllows,
  RESUME_SCOPES,
  RESUME_SESSION_TTL_SECONDS,
  RESUME_TOKEN_TTL_SECONDS,
  type ResumableRegistration,
} from "../src/lib/resume-access";
import { CapturingSender, Harness, InMemoryResumeStore } from "./_test-fakes";

const t = new Harness();

const OPEN_EVENT = {
  status: "upcoming" as const,
  is_draft: false,
  registration_open: true,
  payments_open: true,
  start_date: "2099-01-01T12:00:00.000Z",
  end_date: "2099-03-01T12:00:00.000Z",
};
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-4222-8222-222222222222";
const REG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeStore() {
  const store = new InMemoryResumeStore();
  const reg = (id: string, email: string, tournamentId: string): ResumableRegistration & { tournamentId: string } => ({
    id,
    email,
    tournamentTitle: "Community Cup - Fall 2026",
    tournament: OPEN_EVENT,
    tournamentId,
  });
  store.registrations.set(REG_A, reg(REG_A, "alice@example.com", EVENT_ID));
  store.registrations.set(REG_B, reg(REG_B, "bob@example.com", EVENT_ID));
  return store;
}

async function main() {
  /* ---------------- secrets ---------------- */
  const s1 = generateSecret();
  const s2 = generateSecret();
  t.check("secret is 43 base64url chars (32 bytes = 256 bits)", /^[A-Za-z0-9_-]{43}$/.test(s1));
  t.check("two secrets differ", s1 !== s2);
  t.check("hash is sha256 hex and not the secret", /^[0-9a-f]{64}$/.test(hashSecret(s1)) && hashSecret(s1) !== s1);

  /* ---------------- request a link ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    const deps = { store, sender, baseUrl: "https://www.example.com" };

    const known = await requestResumeLink(deps, { email: "Alice@Example.com ", tournamentId: EVENT_ID, clientIp: "1.1.1.1" });
    t.eq("known email → link sent (normalised email)", known, { sent: true, reason: "sent" });
    t.check("email addressed to the registration's stored email", sender.sent[0]?.to === "alice@example.com");
    t.check("link points at the exchange page with a raw token", /^https:\/\/www\.example\.com\/pay\/resume\/exchange\?t=[A-Za-z0-9_-]{43}$/.test(sender.sent[0]?.link ?? ""));
    const stored = [...store.tokens.values()][0];
    t.check("store holds only the hash, never the raw token", stored.tokenHash === hashSecret(sender.lastToken()!) && stored.tokenHash !== sender.lastToken());
    t.check("token expires in 20 minutes", Math.abs(stored.expiresAt - (Date.now() + RESUME_TOKEN_TTL_SECONDS * 1000)) < 5000);

    const unknown = await requestResumeLink(deps, { email: "nobody@example.com", tournamentId: EVENT_ID, clientIp: "1.1.1.2" });
    t.eq("unknown email → nothing sent", unknown, { sent: false, reason: "no_registration" });
    t.check("unknown email issued no token", store.tokens.size === 1);

    const wrongEvent = await requestResumeLink(deps, { email: "bob@example.com", tournamentId: OTHER_EVENT_ID, clientIp: "1.1.1.3" });
    t.eq("known email, other event → nothing sent", wrongEvent, { sent: false, reason: "no_registration" });

    // Closed event: registration exists but the calendar backstop refuses.
    const closed = makeStore();
    closed.registrations.get(REG_A)!.tournament = { ...OPEN_EVENT, start_date: "2020-01-01T12:00:00.000Z", end_date: "2020-01-02T12:00:00.000Z" };
    const closedOut = await requestResumeLink({ ...deps, store: closed }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    t.eq("finished event → nothing sent", closedOut, { sent: false, reason: "event_not_accepting_payments" });
  }

  /* ---------------- throttle ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    const deps = { store, sender, baseUrl: "https://www.example.com" };
    const first = await requestResumeLink(deps, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: "9.9.9.9" });
    const second = await requestResumeLink(deps, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: "9.9.9.9" });
    t.eq("second request inside the cooldown is throttled", [first.reason, second.reason], ["sent", "throttled"]);
    t.check("throttled request issued no second token", store.tokens.size === 1);
    t.check("throttle records digests, not the email", store.requests.every((r) => !r.emailDigest.includes("@") && r.emailDigest.length === 64));

    // The cooldown expires; the legitimate user gets another link.
    let clock = Date.now() + 61_000;
    store.now = () => clock;
    const third = await requestResumeLink({ ...deps, now: () => new Date(clock) }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: "9.9.9.9" });
    t.eq("after the cooldown a new link is sent", third.reason, "sent");

    // Hourly cap per email, then release after the hour.
    for (let i = 0; i < 10; i++) {
      clock += 61_000;
      await requestResumeLink({ ...deps, now: () => new Date(clock) }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: `10.0.0.${i}` });
    }
    const capped = await requestResumeLink({ ...deps, now: () => new Date(clock + 61_000) }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: "10.0.1.1" });
    t.eq("hourly cap reached → throttled", capped.reason, "throttled");
    clock += 3600_000 + 1;
    const released = await requestResumeLink({ ...deps, now: () => new Date(clock) }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: "10.0.1.2" });
    t.eq("an hour later the address is usable again (no permanent lockout)", released.reason, "sent");
  }

  /* ---------------- exchange ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    const deps = { store, sender, baseUrl: "https://www.example.com" };
    await requestResumeLink(deps, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    const raw = sender.lastToken()!;

    t.eq("malformed token rejected", (await exchangeResumeToken(store, "not-a-token")).ok, false);
    t.eq("wrong (unknown) token rejected", (await exchangeResumeToken(store, generateSecret())).ok, false);

    const ok = await exchangeResumeToken(store, raw);
    t.check("valid token exchanges for a session", ok.ok);
    if (!ok.ok) return t.done();
    t.eq("session is bound to the token's registration", ok.registrationId, REG_A);
    t.check("session secret is fresh 256-bit and differs from the token", /^[A-Za-z0-9_-]{43}$/.test(ok.sessionSecret) && ok.sessionSecret !== raw);
    t.check("store holds only the session hash", store.sessionFor(hashSecret(ok.sessionSecret)) !== null && !store.sessionFor(ok.sessionSecret));
    t.check("session expiry is 24h", Math.abs(Date.parse(ok.expiresAt) - (Date.now() + RESUME_SESSION_TTL_SECONDS * 1000)) < 5000);

    const again = await exchangeResumeToken(store, raw);
    t.eq("consumed token cannot be reused", again.ok, false);
    t.check("reuse created no second session", store.sessions.size === 1);
  }

  /* ---------------- expired / revoked ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    const deps = { store, sender, baseUrl: "https://www.example.com" };
    await requestResumeLink(deps, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    const raw = sender.lastToken()!;
    store.now = () => Date.now() + (RESUME_TOKEN_TTL_SECONDS + 1) * 1000;
    t.eq("expired token rejected", (await exchangeResumeToken(store, raw)).ok, false);

    const store2 = makeStore();
    const sender2 = new CapturingSender();
    await requestResumeLink({ store: store2, sender: sender2, baseUrl: "https://www.example.com" }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    const raw2 = sender2.lastToken()!;
    store2.revokeToken(hashSecret(raw2));
    t.eq("revoked token rejected", (await exchangeResumeToken(store2, raw2)).ok, false);
  }

  /* ---------------- concurrency ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    await requestResumeLink({ store, sender, baseUrl: "https://www.example.com" }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    const raw = sender.lastToken()!;
    const results = await Promise.all([
      exchangeResumeToken(store, raw),
      exchangeResumeToken(store, raw),
      exchangeResumeToken(store, raw),
    ]);
    const winners = results.filter((r) => r.ok).length;
    t.eq("three simultaneous consumes → exactly one session", winners, 1);
    t.eq("store holds exactly one session row", store.sessions.size, 1);
  }

  /* ---------------- session authentication & scope ---------------- */
  {
    const store = makeStore();
    const sender = new CapturingSender();
    await requestResumeLink({ store, sender, baseUrl: "https://www.example.com" }, { email: "alice@example.com", tournamentId: EVENT_ID, clientIp: null });
    const ex = await exchangeResumeToken(store, sender.lastToken()!);
    if (!ex.ok) return t.done();

    const session = await authenticateResumeSession(store, ex.sessionSecret);
    t.check("cookie secret authenticates", session !== null && session.registrationId === REG_A);
    t.eq("session carries exactly the allowed scopes", [...(session?.scopes ?? [])].sort(), [...RESUME_SCOPES].sort());
    t.check("session allows its own registration", sessionAllows(session, "payment:start", REG_A));
    t.check("session does NOT allow another registration", !sessionAllows(session, "payment:start", REG_B));
    t.check("unknown scope is refused", !sessionAllows(session, "admin:mark-cash-paid" as never, REG_A));

    t.check("garbage cookie does not authenticate", (await authenticateResumeSession(store, "nope")) === null);
    t.check("unknown secret does not authenticate", (await authenticateResumeSession(store, generateSecret())) === null);
    t.check("token used as cookie does not authenticate", (await authenticateResumeSession(store, sender.lastToken()!)) === null);

    const expired = await authenticateResumeSession(store, ex.sessionSecret, new Date(Date.now() + (RESUME_SESSION_TTL_SECONDS + 1) * 1000));
    t.check("expired session does not authenticate", expired === null);

    await store.revokeSession(ex.sessionId);
    t.check("revoked session does not authenticate", (await authenticateResumeSession(store, ex.sessionSecret)) === null);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
