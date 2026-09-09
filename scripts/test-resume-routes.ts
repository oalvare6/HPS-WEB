/**
 * F-01 HTTP contract: the neutral eligibility response, the exchange, and the
 * cookie-authenticated resume routes (origin check, scope, one registration).
 *
 * Run: npx tsx scripts/test-resume-routes.ts
 */
import {
  handleResumeCancel,
  handleResumeCheckout,
  handleResumeExchange,
  handleResumeLinkRequest,
  handleResumeSignOut,
  handleResumeWaiverStart,
  type ResumeRouteDeps,
} from "../src/lib/resume-routes";
import { RESUME_COOKIE_NAME, RESUME_COOKIE_PATH } from "../src/lib/resume-session";
import { exchangeResumeToken, hashSecret, type ResumableRegistration } from "../src/lib/resume-access";
import { CapturingSender, Harness, InMemoryResumeStore, RecordingOps } from "./_test-fakes";

const t = new Harness();
const SITE = "https://www.example.com";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPEN_EVENT = {
  status: "upcoming" as const,
  is_draft: false,
  registration_open: true,
  payments_open: true,
  start_date: "2099-01-01T12:00:00.000Z",
  end_date: "2099-03-01T12:00:00.000Z",
};

function build() {
  const store = new InMemoryResumeStore();
  const reg = (id: string, email: string): ResumableRegistration & { tournamentId: string } => ({
    id, email, tournamentTitle: "Community Cup", tournament: OPEN_EVENT, tournamentId: EVENT_ID,
  });
  store.registrations.set(REG_A, reg(REG_A, "alice@example.com"));
  store.registrations.set(REG_B, reg(REG_B, "bob@example.com"));
  const sender = new CapturingSender();
  const ops = new RecordingOps();
  ops.add(REG_A);
  ops.add(REG_B);
  const deps: ResumeRouteDeps = { store, sender, ops, baseUrl: SITE, siteUrl: SITE };
  return { store, sender, ops, deps };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "www.example.com", ...headers },
    body: JSON.stringify(body),
  });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Mint a real session via the whole flow, return the raw cookie value. */
async function login(deps: ResumeRouteDeps, sender: CapturingSender, store: InMemoryResumeStore, email: string) {
  await handleResumeLinkRequest(post("/api/pay/eligibility", { email, tournamentId: EVENT_ID }), deps);
  const raw = sender.lastToken()!;
  const ex = await exchangeResumeToken(store, raw);
  if (!ex.ok) throw new Error("exchange failed");
  return ex.sessionSecret;
}

const same = { origin: SITE };
const cookie = (secret: string) => ({ cookie: `${RESUME_COOKIE_NAME}=${encodeURIComponent(secret)}` });

async function main() {
  /* ---------------- neutral eligibility ---------------- */
  {
    const { deps, sender, store } = build();
    const known = await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "alice@example.com", tournamentId: EVENT_ID }), deps);
    const unknown = await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "stranger@example.com", tournamentId: EVENT_ID }, { "x-forwarded-for": "5.5.5.5" }), deps);
    const knownBody = await bodyOf(known);
    const unknownBody = await bodyOf(unknown);
    t.eq("existing email → 200", known.status, 200);
    t.eq("nonexistent email → 200", unknown.status, 200);
    t.eq("existing and nonexistent bodies are identical", knownBody, unknownBody);
    t.eq("body is the neutral message only", Object.keys(knownBody).sort(), ["message", "success"]);
    t.eq("message is the fixed neutral sentence", knownBody.message, "If an active pending registration exists for that email, a secure link has been sent to it.");
    t.check("body carries no token, uuid, name, status or event data", !JSON.stringify({ ...knownBody, message: "" }).match(/token|[0-9a-f]{8}-[0-9a-f]{4}|first|status|event|balance/i));
    t.check("one link was sent, to the known address only", sender.sent.length === 1 && sender.sent[0].to === "alice@example.com");

    // Paid / cancelled / other-event registrations are simply "not resumable" in the store.
    const paidStore = new InMemoryResumeStore(); // no registrations at all
    const paid = await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "alice@example.com", tournamentId: EVENT_ID }), { ...deps, store: paidStore });
    t.eq("completed/cancelled/ineligible registration → same neutral 200", await bodyOf(paid), knownBody);

    // Infrastructure failure must not change the answer either.
    store.failNext = "findResumableRegistration";
    const failing = await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "bob@example.com", tournamentId: EVENT_ID }, { "x-forwarded-for": "6.6.6.6" }), deps);
    t.eq("store failure → still the neutral 200", await bodyOf(failing), knownBody);

    t.eq("structurally invalid email → 400 (reveals nothing)", (await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "x", tournamentId: EVENT_ID }), deps)).status, 400);
    t.eq("missing tournamentId → 400", (await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "a@b.co" }), deps)).status, 400);
    t.check("response is no-store", known.headers.get("cache-control") === "no-store");
  }

  /* ---------------- exchange ---------------- */
  {
    const { deps, sender, store } = build();
    await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "alice@example.com", tournamentId: EVENT_ID }), deps);
    const raw = sender.lastToken()!;

    const cross = await handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }, { origin: "https://evil.example" }), deps);
    t.eq("exchange from a foreign origin → 403", cross.status, 403);
    t.eq("foreign-origin attempt did not consume the token", [...store.tokens.values()][0].consumedAt, null);

    const ok = await handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }, same), deps);
    t.eq("exchange → 303", ok.status, 303);
    t.eq("redirects to the clean resume URL (no token)", ok.headers.get("location"), "/pay/resume");
    const setCookie = ok.headers.get("set-cookie") ?? "";
    t.check("sets an HttpOnly, SameSite=Lax cookie on the narrow path", /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && setCookie.includes(`Path=${RESUME_COOKIE_PATH}`));
    const secret = decodeURIComponent(setCookie.split(";")[0].split("=")[1]);
    t.check("cookie value is the raw session secret and the store has only its hash", store.sessionFor(hashSecret(secret)) !== null);
    t.check("cookie carries no registration id / email", !setCookie.includes(REG_A) && !setCookie.includes("alice"));

    const malformed = await handleResumeExchange(post("/pay/resume/api/exchange", { token: "short" }, same), deps);
    t.eq("malformed token → 303 to the malformed-link page (store never consulted)", malformed.headers.get("location"), "/pay/resume?link=malformed");
    const noBody = await handleResumeExchange(new Request(`${SITE}/pay/resume/api/exchange`, { method: "POST", headers: { origin: SITE, host: "www.example.com" } }), deps);
    t.eq("empty body → malformed, not invalid", noBody.headers.get("location"), "/pay/resume?link=malformed");
    const charsetForm = new Request(`${SITE}/pay/resume/api/exchange`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", origin: SITE, host: "www.example.com" },
      body: new URLSearchParams({ token: raw }).toString(),
    });
    // The token was consumed by the successful exchange above, so a parsed body reaches
    // the store and is refused as `invalid`; a body that failed to parse would be `malformed`.
    t.eq("form body with charset parameter is parsed (store consulted → invalid, not malformed)", (await handleResumeExchange(charsetForm, deps)).headers.get("location"), "/pay/resume?link=invalid");
    const reuse = await handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }, same), deps);
    t.eq("re-used token → 303 to the invalid-link page", reuse.headers.get("location"), "/pay/resume?link=invalid");
    t.check("re-use sets no cookie at all: it neither mints a session nor touches an existing one", reuse.headers.get("set-cookie") === null);
    t.check("malformed exchange also leaves any existing cookie alone", malformed.headers.get("set-cookie") === null);
    // A live session survives someone re-clicking a used link: the page it lands on still authenticates.
    const afterReuse = await handleResumeCheckout(post("/pay/resume/api/checkout", {}, { ...same, cookie: setCookie.split(";")[0] }), deps);
    t.eq("session from the first exchange still works after a refused re-use", afterReuse.status, 200);

    // Form-encoded submission (the no-JS button) works too.
    await handleResumeLinkRequest(post("/api/pay/eligibility", { email: "bob@example.com", tournamentId: EVENT_ID }, { "x-forwarded-for": "7.7.7.7" }), deps);
    const raw2 = sender.lastToken()!;
    const form = new Request(`${SITE}/pay/resume/api/exchange`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: SITE, host: "www.example.com" },
      body: new URLSearchParams({ token: raw2 }).toString(),
    });
    t.eq("form-encoded exchange → 303", (await handleResumeExchange(form, deps)).status, 303);
  }

  /* ---------------- cookie-authenticated routes ---------------- */
  {
    const { deps, sender, store, ops } = build();
    const secretA = await login(deps, sender, store, "alice@example.com");

    // Origin / CSRF
    const noOrigin = await handleResumeCheckout(post("/pay/resume/api/checkout", {}, cookie(secretA)), deps);
    t.eq("state change without Origin/Referer → 403", noOrigin.status, 403);
    const evil = await handleResumeCancel(post("/pay/resume/api/cancel", {}, { ...cookie(secretA), origin: "https://evil.example" }), deps);
    t.eq("cancel from a foreign origin → 403", evil.status, 403);
    const fetchSite = await handleResumeCancel(post("/pay/resume/api/cancel", {}, { ...cookie(secretA), origin: SITE, "sec-fetch-site": "cross-site" }), deps);
    t.eq("Sec-Fetch-Site: cross-site is refused even with a matching Origin", fetchSite.status, 403);
    t.check("no registration was touched by refused requests", ops.calls.length === 0);
    const referer = await handleResumeCheckout(post("/pay/resume/api/checkout", {}, { ...cookie(secretA), referer: `${SITE}/pay/resume` }), deps);
    t.eq("same-origin Referer is accepted when Origin is absent", referer.status, 200);

    // No cookie / bad cookie
    t.eq("no cookie → 401", (await handleResumeCheckout(post("/pay/resume/api/checkout", {}, same), deps)).status, 401);
    t.eq("token as cookie → 401", (await handleResumeCheckout(post("/pay/resume/api/checkout", {}, { ...same, ...cookie(sender.lastToken()!) }), deps)).status, 401);

    // Happy paths, all bound to REG_A
    const checkout = await handleResumeCheckout(post("/pay/resume/api/checkout", { registrationId: REG_B }, { ...same, ...cookie(secretA) }), deps);
    t.eq("checkout → 200 with a Stripe URL", checkout.status, 200);
    t.check("checkout ignores a body naming another registration", ops.calls.at(-1)?.registrationId === REG_A);

    const waiver = await handleResumeWaiverStart(post("/pay/resume/api/waiver", {}, { ...same, ...cookie(secretA) }), deps);
    t.eq("waiver start → 409 when already signed", waiver.status, 409);
    ops.registrations.get(REG_A)!.waiverSigned = false;
    const waiver2 = await handleResumeWaiverStart(post("/pay/resume/api/waiver", {}, { ...same, ...cookie(secretA) }), deps);
    t.eq("waiver start → 200 with the provider URL", waiver2.status, 200);
    t.check("starting the waiver did NOT complete it", ops.registrations.get(REG_A)!.waiverSigned === false && ops.registrations.get(REG_A)!.waiverCompletedDirectly === false);

    // Cross-registration: a session for A can never reach B.
    const secretB = await login(deps, sender, store, "bob@example.com");
    ops.calls = [];
    await handleResumeCancel(post("/pay/resume/api/cancel", { registrationId: REG_A }, { ...same, ...cookie(secretB) }), deps);
    t.check("B's session cancels only B, even when the body names A", ops.calls.every((c) => c.registrationId === REG_B) && ops.registrations.get(REG_A)!.cancelledAt === null);

    // Cancel is scoped and idempotent.
    const c1 = await handleResumeCancel(post("/pay/resume/api/cancel", {}, { ...same, ...cookie(secretA) }), deps);
    const c2 = await handleResumeCancel(post("/pay/resume/api/cancel", {}, { ...same, ...cookie(secretA) }), deps);
    t.eq("first cancel → 200 not-already", (await bodyOf(c1)).alreadyCancelled, false);
    t.eq("second cancel → 200 already-cancelled", (await bodyOf(c2)).alreadyCancelled, true);

    // The resume surface has no operation that marks cash received or completes a waiver.
    const forbiddenOps = Object.keys(ops).filter((k) => /cash|markPaid|complete|sign(?!Out)/i.test(k));
    t.eq("ops interface exposes no cash/mark-paid/complete-waiver operation", forbiddenOps, []);
    const anyRegistrationMutatedIllegally = [...ops.registrations.values()].some((r) => r.cashMarkedPaid || r.waiverCompletedDirectly || (r.paymentStatus === "paid"));
    t.check("no registration was marked paid or waiver-completed through the resume surface", !anyRegistrationMutatedIllegally);

    // Sign-out revokes.
    const out = await handleResumeSignOut(post("/pay/resume/api/sign-out", {}, { ...same, ...cookie(secretB) }), deps);
    t.eq("sign-out → 303", out.status, 303);
    t.eq("revoked session → 401 afterwards", (await handleResumeCheckout(post("/pay/resume/api/checkout", {}, { ...same, ...cookie(secretB) }), deps)).status, 401);
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
