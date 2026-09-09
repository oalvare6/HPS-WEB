/**
 * Stage 1.3 — the magic-link interstitial. Tests 25–28 of the stage spec.
 *
 *   GET /pay/resume/exchange?t=<token>   renders a form, consumes nothing
 *   POST /pay/resume/api/exchange        consumes exactly once → 303 /pay/resume
 *
 * The page is rendered for real (its React element tree is inspected), the
 * response headers come from next.config.ts, and the exchange runs through the
 * same handler the route file adapts.
 *
 * Run: npx tsx scripts/test-interstitial.ts
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
// The page's JSX is compiled with the classic runtime under tsx (tsconfig
// `jsx: preserve`), so React must be in scope before the module is loaded.
(globalThis as unknown as { React: unknown }).React = React;

import nextConfig, { RESUME_EXCHANGE_HEADERS } from "../next.config";
import { exchangeResumeToken, hashSecret, looksLikeRawSecret, type ResumableRegistration } from "../src/lib/resume-access";
import { handleResumeCheckout, handleResumeExchange, handleResumeLinkRequest, type ResumeRouteDeps } from "../src/lib/resume-routes";
import { RESUME_COOKIE_NAME } from "../src/lib/resume-session";
import { CapturingSender, Harness, InMemoryResumeStore, RecordingOps } from "./_test-fakes";

const t = new Harness();
const ROOT = path.join(__dirname, "..");
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

type Node = { type: string; props: Record<string, unknown> };

/** Flatten a React element tree into (type, props) pairs without rendering to DOM. */
function walk(node: unknown, out: Node[] = []): Node[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out));
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined) {
    const type =
      typeof el.type === "string"
        ? el.type
        : ((el.type as { displayName?: string }).displayName ?? (el.type as { name?: string }).name ?? "component");
    out.push({ type, props: el.props ?? {} });
  }
  if (el.props) walk(el.props.children, out);
  return out;
}

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

function post(path_: string, body: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path_}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", host: "www.example.com", origin: SITE, ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

async function mintLink(deps: ResumeRouteDeps, sender: CapturingSender, email: string, ip: string) {
  await handleResumeLinkRequest(
    new Request(`${SITE}/api/pay/eligibility`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "www.example.com", "x-forwarded-for": ip },
      body: JSON.stringify({ email, tournamentId: EVENT_ID }),
    }),
    deps
  );
  return sender.lastToken()!;
}

async function main() {
  const page = await import("../src/app/pay/resume/exchange/page");
  const pageSrc = fs.readFileSync(path.join(ROOT, "src/app/pay/resume/exchange/page.tsx"), "utf8");
  const autoSubmitSrc = fs.readFileSync(path.join(ROOT, "src/components/pay/ExchangeAutoSubmit.tsx"), "utf8");

  /* ---------------- Test 25: the GET consumes nothing ---------------- */
  {
    const { store, sender, deps } = build();
    const raw = await mintLink(deps, sender, "alice@example.com", "1.1.1.1");
    const tokenRow = store.tokens.get(hashSecret(raw))!;

    const tree = walk(await page.default({ searchParams: Promise.resolve({ t: raw }) }));
    t.check("25. the interstitial renders (a form is present)", tree.some((n) => n.type === "form"));
    t.eq("25b. rendering did not consume the token", tokenRow.consumedAt, null);
    t.eq("25c. rendering minted no session", store.sessions.size, 0);
    t.check("25d. the page module imports no store, exchange or database code", !/exchangeResumeToken|consumeAccessToken|resume-store|supabase|getResumeStore/.test(pageSrc));
    t.check("25e. the page is dynamic (never statically cached with a token)", /export const dynamic = "force-dynamic"/.test(pageSrc));

    // The token is still exchangeable afterwards — the GET was a no-op.
    const ex = await exchangeResumeToken(store, raw);
    t.eq("25f. the same token exchanges after the GET", ex.ok, true);

    // Render again with a used token: still a plain form (the page cannot know).
    const again = walk(await page.default({ searchParams: Promise.resolve({ t: raw }) }));
    t.check("25g. a second GET renders the same form — the page never reveals token state", again.some((n) => n.type === "form"));

    // Shape of the form.
    const form = tree.find((n) => n.type === "form")!;
    t.eq("25h. form posts", String(form.props.method).toLowerCase(), "post");
    t.eq("25i. form action is the same-origin exchange route", form.props.action, "/pay/resume/api/exchange");
    const hidden = tree.find((n) => n.type === "input")!;
    t.eq("25j. the token travels as a hidden POST field", [hidden.props.type, hidden.props.name], ["hidden", "token"]);
    t.eq("25k. hidden field holds the raw token", hidden.props.value, raw);
    t.check("25l. auto-submit is present (kept on purpose)", tree.some((n) => n.type === "ExchangeAutoSubmit"));
    t.check("25m. auto-submit uses requestSubmit, no fetch and no navigation of its own", /requestSubmit\(\)/.test(autoSubmitSrc) && !/fetch\(|location\.|window\.open/.test(autoSubmitSrc));
    t.check("25n. a no-JS button remains", tree.some((n) => n.type === "button" && n.props.type === "submit"));

    // A malformed / missing token renders no form at all.
    const noToken = walk(await page.default({ searchParams: Promise.resolve({}) }));
    t.check("25o. no token → no form, no hidden field", !noToken.some((n) => n.type === "form" || n.type === "input"));
    const badToken = walk(await page.default({ searchParams: Promise.resolve({ t: "not-a-token" }) }));
    t.check("25p. malformed token → no form", !badToken.some((n) => n.type === "form"));
    t.check("25q. the malformed page's only link is same-origin", badToken.filter((n) => typeof n.props.href === "string").every((n) => String(n.props.href).startsWith("/")));
    t.check("fixture: raw tokens look like raw secrets", looksLikeRawSecret(raw));
  }

  /* ---------------- Test 26: response protections ---------------- */
  {
    const headerFor = (key: string) => RESUME_EXCHANGE_HEADERS.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? null;
    t.eq("26. Cache-Control: no-store on the interstitial", headerFor("Cache-Control"), "no-store");
    // `strict-origin` rather than `no-referrer` on purpose: a same-origin form
    // POST from a `no-referrer` document is sent with `Origin: null` (Fetch,
    // "append a request Origin header"), which would fail the exchange's
    // same-origin check. Both policies strip the token-bearing path from every
    // Referer; only strict-origin keeps the POST identifiable as ours.
    t.check("26b. Referrer-Policy never leaks the path (strict-origin or no-referrer)", ["strict-origin", "no-referrer"].includes(headerFor("Referrer-Policy") ?? ""));
    t.eq("26c. the chosen policy is strict-origin (see comment)", headerFor("Referrer-Policy"), "strict-origin");

    const rules = await (nextConfig.headers as () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>)();
    const rule = rules.find((r) => r.source === "/pay/resume/exchange");
    t.check("26d. next.config applies those headers to exactly the interstitial path", rule !== undefined && JSON.stringify(rule.headers) === JSON.stringify(RESUME_EXCHANGE_HEADERS));
    t.check("26e. the page's own metadata sets the same referrer policy (meta tag for the document)", (page.metadata as { referrer?: string }).referrer === headerFor("Referrer-Policy"));
    t.check("26f. robots: noindex, nofollow", (page.metadata as { robots?: { index?: boolean; follow?: boolean } }).robots?.index === false && (page.metadata as { robots?: { follow?: boolean } }).robots?.follow === false);

    // No analytics, no third-party resources on the token-bearing page.
    const tree = walk(await page.default({ searchParams: Promise.resolve({ t: "A".repeat(43) }) }));
    const external = tree.filter((n) => ["script", "img", "iframe", "link", "video", "audio", "object", "embed"].includes(n.type));
    t.eq("26g. the rendered tree has no script/img/iframe/link elements at all", external.map((n) => n.type), []);
    const hrefs = tree.filter((n) => typeof n.props.href === "string" || typeof n.props.src === "string");
    t.eq("26h. nothing on the token page points anywhere (no href/src)", hrefs.length, 0);
    t.check("26i. the page imports no analytics/telemetry module", !pageSrc.split("\n").some((l) => /^import /.test(l) && /analytics|gtag|posthog|segment|vercel|track/i.test(l)));
    t.check("26j. the page source imports only local modules and next/link", pageSrc.split("\n").filter((l) => /^import /.test(l)).every((l) => /from "(next\/link|@\/)/.test(l)));
    const imports = pageSrc.split("\n").filter((l) => /^import /.test(l));
    t.eq("26k. exactly three imports (Link, looksLikeRawSecret, ExchangeAutoSubmit)", imports.length, 3);
  }

  /* ---------------- Test 27: POST consumes exactly once ---------------- */
  {
    const { store, sender, deps } = build();
    const raw = await mintLink(deps, sender, "alice@example.com", "2.2.2.2");

    // Two POSTs racing for the same token: one wins.
    const [r1, r2] = await Promise.all([
      handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }), deps),
      handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }), deps),
    ]);
    const winners = [r1, r2].filter((r) => r.headers.get("location") === "/pay/resume");
    const losers = [r1, r2].filter((r) => r.headers.get("location") === "/pay/resume?link=invalid");
    t.eq("27. exactly one of two concurrent exchanges wins", winners.length, 1);
    t.eq("27b. the other is refused as invalid", losers.length, 1);
    t.eq("27c. exactly one session exists", store.sessions.size, 1);
    t.check("27d. the winner set the cookie; the loser set none", winners[0].headers.get("set-cookie") !== null && losers[0].headers.get("set-cookie") === null);
    t.eq("27e. the token is consumed", store.tokens.get(hashSecret(raw))!.consumedAt !== null, true);
    t.eq("27f. a third try is refused too", (await handleResumeExchange(post("/pay/resume/api/exchange", { token: raw }), deps)).headers.get("location"), "/pay/resume?link=invalid");
    t.eq("27g. still one session", store.sessions.size, 1);
    t.check("27h. the final URL carries no token", !String(winners[0].headers.get("location")).includes(raw));
    t.eq("27i. the winning response is no-store", winners[0].headers.get("cache-control"), "no-store");
  }

  /* ---------------- Test 28: a refused exchange leaves a live session alone ---------------- */
  {
    const { store, sender, deps } = build();
    const rawA = await mintLink(deps, sender, "alice@example.com", "3.3.3.3");
    const rawB = await mintLink(deps, sender, "bob@example.com", "4.4.4.4");
    const okB = await handleResumeExchange(post("/pay/resume/api/exchange", { token: rawB }), deps);
    const cookieB = String(okB.headers.get("set-cookie")).split(";")[0];
    t.eq("fixture: Bob's session is live", okB.status, 303);
    // Consume Alice's token once, so a re-click is a refused exchange.
    await handleResumeExchange(post("/pay/resume/api/exchange", { token: rawA }), deps);

    // Bob's browser (holding Bob's cookie) re-clicks Alice's used link.
    const reclick = await handleResumeExchange(post("/pay/resume/api/exchange", { token: rawA }, { cookie: cookieB }), deps);
    t.eq("28. re-click of a used link → refused", reclick.headers.get("location"), "/pay/resume?link=invalid");
    t.eq("28b. ...sets no cookie (does not clear the existing one)", reclick.headers.get("set-cookie"), null);
    const stillB = await handleResumeCheckout(new Request(`${SITE}/pay/resume/api/checkout`, { method: "POST", headers: { "content-type": "application/json", host: "www.example.com", origin: SITE, cookie: cookieB }, body: "{}" }), deps);
    t.eq("28c. Bob's session still authenticates afterwards", stillB.status, 200);
    t.check("28d. Bob's session row is not revoked", [...store.sessions.values()].every((s) => s.revokedAt === null));

    const garbage = await handleResumeExchange(post("/pay/resume/api/exchange", { token: "garbage" }, { cookie: cookieB }), deps);
    t.eq("28e. malformed token → refused as malformed", garbage.headers.get("location"), "/pay/resume?link=malformed");
    t.eq("28f. ...no cookie touched", garbage.headers.get("set-cookie"), null);
    t.eq("28g. ...Bob still signed in", (await handleResumeCheckout(new Request(`${SITE}/pay/resume/api/checkout`, { method: "POST", headers: { "content-type": "application/json", host: "www.example.com", origin: SITE, cookie: cookieB }, body: "{}" }), deps)).status, 200);
    t.check("cookie name sanity", cookieB.startsWith(`${RESUME_COOKIE_NAME}=`));
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
