/**
 * Stage 1.3 MGT-01 — the signed-in owner routes that replaced the 90-day HMAC
 * token on `/register`'s status cards: ownership, same-origin, and the fact
 * that a token-shaped credential anywhere in the request is simply never read.
 *
 * Run: npx tsx scripts/test-account-routes.ts
 */
import {
  ACCOUNT_NOT_YOURS_MESSAGE,
  handleAccountCancel,
  handleAccountCheckout,
  handleAccountPaymentMethod,
  handleAccountWaiverSign,
  type AccountIdentity,
  type AccountRouteDeps,
} from "../src/lib/account-routes";
import { Harness, RecordingAccountOps } from "./_test-fakes";

const t = new Harness();
const SITE = "https://www.example.com";
const REG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REG_MISSING = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REG_LEGACY = "ffffffff-ffff-4fff-8fff-ffffffffffff"; // no contact link
const ALICE: AccountIdentity = { contactId: "11111111-1111-4111-8111-111111111111", email: "alice@example.com" };
const BOB: AccountIdentity = { contactId: "22222222-2222-4222-8222-222222222222", email: "bob@example.com" };

function build(identity: AccountIdentity | null) {
  const ops = new RecordingAccountOps();
  ops.add(REG_A, ALICE.contactId, { waiverSigned: false });
  ops.add(REG_B, BOB.contactId);
  ops.add(REG_LEGACY, null);
  const deps: AccountRouteDeps = { identity: async () => identity, ops, baseUrl: SITE, siteUrl: SITE };
  return { ops, deps };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "www.example.com", origin: SITE, ...headers },
    body: JSON.stringify(body),
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const HANDLERS = [
  ["cancel", handleAccountCancel],
  ["payment-method", handleAccountPaymentMethod],
  ["checkout", handleAccountCheckout],
  ["waiver-sign", handleAccountWaiverSign],
] as const;

async function main() {
  /* ---------------- guard order ---------------- */
  {
    const { deps, ops } = build(ALICE);
    for (const [name, handler] of HANDLERS) {
      t.eq(`${name}: non-UUID id → 400`, (await handler(post(`/api/registrations/x/${name}`, {}), "not-a-uuid", deps)).status, 400);
      t.eq(`${name}: cross-origin → 403`, (await handler(post(`/api/registrations/${REG_A}/${name}`, {}, { origin: "https://evil.example" }), REG_A, deps)).status, 403);
      t.eq(`${name}: no Origin/Referer → 403`, (await handler(new Request(`${SITE}/api/registrations/${REG_A}/${name}`, { method: "POST", headers: { host: "www.example.com", "content-type": "application/json" }, body: "{}" }), REG_A, deps)).status, 403);
      t.eq(`${name}: Sec-Fetch-Site cross-site → 403`, (await handler(post(`/api/registrations/${REG_A}/${name}`, {}, { "sec-fetch-site": "cross-site" }), REG_A, deps)).status, 403);
    }
    t.eq("refused requests never reached the ops", ops.calls.length, 0);
  }

  /* ---------------- identity and ownership ---------------- */
  {
    const anon = build(null);
    for (const [name, handler] of HANDLERS) {
      const res = await handler(post(`/api/registrations/${REG_A}/${name}`, { method: "cash", signedName: "Alice Example" }), REG_A, anon.deps);
      t.eq(`${name}: signed out → 401`, res.status, 401);
    }
    t.eq("signed out: nothing touched", anon.ops.calls.length, 0);

    const bob = build(BOB);
    const notMine = await handleAccountCancel(post(`/api/registrations/${REG_A}/cancel`, {}), REG_A, bob.deps);
    const missing = await handleAccountCancel(post(`/api/registrations/${REG_MISSING}/cancel`, {}), REG_MISSING, bob.deps);
    const legacy = await handleAccountCancel(post(`/api/registrations/${REG_LEGACY}/cancel`, {}), REG_LEGACY, bob.deps);
    t.eq("another player's registration → 403", notMine.status, 403);
    t.eq("nonexistent registration → 403 (same status)", missing.status, 403);
    t.eq("...and the same body: an authenticated stranger cannot tell 'exists' from 'not yours'", await bodyOf(notMine), await bodyOf(missing));
    t.eq("row with no contact link → 403 (fails closed)", legacy.status, 403);
    t.eq("the refusal is the fixed neutral message", (await bodyOf(legacy)).error, ACCOUNT_NOT_YOURS_MESSAGE);
    t.eq("no cancellation happened", bob.ops.registrations.get(REG_A)!.cancelledAt, null);
    t.eq("stranger's attempts never reached the ops", bob.ops.calls.length, 0);

    // Bob's own registration works.
    const mine = await handleAccountCancel(post(`/api/registrations/${REG_B}/cancel`, {}), REG_B, bob.deps);
    t.eq("own registration → 200", mine.status, 200);
    t.eq("...cancelled", typeof bob.ops.registrations.get(REG_B)!.cancelledAt, "string");
    t.eq("...alice's untouched", bob.ops.registrations.get(REG_A)!.cancelledAt, null);
  }

  /* ---------------- the handlers act on the path id only ---------------- */
  {
    const { deps, ops } = build(ALICE);
    // A body naming Bob's registration is ignored: the path is the target.
    const pm = await handleAccountPaymentMethod(post(`/api/registrations/${REG_A}/payment-method`, { method: "cash", registrationId: REG_B }), REG_A, deps);
    t.eq("payment-method on an unsigned row → 409 needsWaiver", pm.status, 409);
    t.eq("...flagged", (await bodyOf(pm)).needsWaiver, true);
    t.check("...only REG_A was touched", ops.calls.every((c) => c.registrationId === REG_A));

    const bad = await handleAccountPaymentMethod(post(`/api/registrations/${REG_A}/payment-method`, { method: "venmo" }), REG_A, deps);
    t.eq("payment-method: unknown method → 400", bad.status, 400);

    const sign = await handleAccountWaiverSign(post(`/api/registrations/${REG_A}/waiver-sign`, { signedName: "Alice Example" }, { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA" }), REG_A, deps);
    t.eq("waiver-sign on own unsigned row → 200", sign.status, 200);
    t.eq("...signed", ops.registrations.get(REG_A)!.waiverSigned, true);
    t.eq("...typed name stored verbatim", ops.registrations.get(REG_A)!.signedName, "Alice Example");

    const pm2 = await handleAccountPaymentMethod(post(`/api/registrations/${REG_A}/payment-method`, { method: "cash" }), REG_A, deps);
    t.eq("payment-method after signing → 200", pm2.status, 200);
    t.eq("...recorded", ops.registrations.get(REG_A)!.paymentMethod, "cash");
    t.eq("...still pending (declaring cash never settles)", ops.registrations.get(REG_A)!.paymentStatus, "pending");

    const co = await handleAccountCheckout(post(`/api/registrations/${REG_A}/checkout`, { registrationId: REG_B }), REG_A, deps);
    t.eq("checkout → 200 with a Stripe URL", co.status, 200);
    t.check("...for REG_A, whatever the body said", ((await bodyOf(co)).url as string).endsWith(REG_A));
    t.check("every identity-bearing op call carried the caller's contact, never a token", ops.calls.filter((c) => c.op === "setPaymentMethod" || c.op === "startCheckout").every((c) => c.contactId === ALICE.contactId));
    t.eq("responses are no-store", co.headers.get("cache-control"), "no-store");
  }

  /* ---------------- a token-shaped credential is never read ---------------- */
  {
    // The retired token's shape: base64url({rid, exp}).hex — see test-legacy-token-retired.ts.
    const inner = Buffer.from(JSON.stringify({ rid: REG_A, exp: Date.now() + 86_400_000 }), "utf8").toString("base64url");
    const legacyToken = `${inner}.${"ab".repeat(32)}`;
    const anon = build(null);
    const placements: Array<[string, (name: string) => Request]> = [
      ["body.payToken", (n) => post(`/api/registrations/${REG_A}/${n}`, { payToken: legacyToken, method: "cash", signedName: "Alice Example" })],
      ["body.token", (n) => post(`/api/registrations/${REG_A}/${n}`, { token: legacyToken, method: "cash", signedName: "Alice Example" })],
      ["query ?payToken", (n) => new Request(`${SITE}/api/registrations/${REG_A}/${n}?payToken=${encodeURIComponent(legacyToken)}`, { method: "POST", headers: { "content-type": "application/json", host: "www.example.com", origin: SITE }, body: JSON.stringify({ method: "cash", signedName: "Alice Example" }) })],
      ["query ?token", (n) => new Request(`${SITE}/api/registrations/${REG_A}/${n}?token=${encodeURIComponent(legacyToken)}`, { method: "POST", headers: { "content-type": "application/json", host: "www.example.com", origin: SITE }, body: "{}" })],
      ["Authorization: Bearer", (n) => post(`/api/registrations/${REG_A}/${n}`, { method: "cash" }, { authorization: `Bearer ${legacyToken}` })],
      ["cookie hps_resume", (n) => post(`/api/registrations/${REG_A}/${n}`, { method: "cash" }, { cookie: `hps_resume=${encodeURIComponent(legacyToken)}` })],
    ];
    for (const [where, make] of placements) {
      for (const [name, handler] of HANDLERS) {
        const res = await handler(make(name), REG_A, anon.deps);
        t.eq(`legacy token in ${where} on ${name}, signed out → 401`, res.status, 401);
      }
    }
    t.eq("no token placement reached the ops", anon.ops.calls.length, 0);
    t.eq("no state changed", anon.ops.registrations.get(REG_A)!.cancelledAt === null && anon.ops.registrations.get(REG_A)!.paymentMethod === null && anon.ops.registrations.get(REG_A)!.waiverSigned === false, true);

    // Signed in as Bob, a token for Alice's row still does nothing.
    const bob = build(BOB);
    for (const [name, handler] of HANDLERS) {
      const res = await handler(post(`/api/registrations/${REG_A}/${name}`, { payToken: legacyToken, method: "cash", signedName: "Alice Example" }), REG_A, bob.deps);
      t.eq(`legacy token for Alice's row, signed in as Bob, ${name} → 403`, res.status, 403);
    }
    t.eq("Bob's attempts with a token never reached the ops", bob.ops.calls.length, 0);
  }

  /* ---------------- identity failure ---------------- */
  {
    const ops = new RecordingAccountOps();
    ops.add(REG_A, ALICE.contactId);
    const deps: AccountRouteDeps = { identity: async () => { throw new Error("auth down"); }, ops, baseUrl: SITE, siteUrl: SITE };
    const res = await handleAccountCancel(post(`/api/registrations/${REG_A}/cancel`, {}), REG_A, deps);
    t.eq("identity lookup failure → 500, never a pass", res.status, 500);
    t.eq("...nothing cancelled", ops.registrations.get(REG_A)!.cancelledAt, null);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
