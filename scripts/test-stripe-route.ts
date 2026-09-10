/**
 * The Stripe webhook ROUTE, not just the handler (Stage 1.4).
 *
 *   npx tsx scripts/test-stripe-route.ts
 *
 * Every other test in this repository enters at `handleStripeWebhook(rawBody,
 * signature, deps)` — the contract — and passes the body in as a string. The
 * route is the part that has to produce that string from a real `Request`, read
 * the right header, and find the right environment variable. None of that was
 * covered anywhere.
 *
 * That is exactly the gap that took the resume flow down on its first day in
 * production: `request.formData()` returned nothing on Vercel's Node runtime
 * while 38 handler-level assertions stayed green, because no test ever went
 * through the route (docs/SESSION-LOG-2026-09-09-RESUME-SMOKE-TEST.md §3). A
 * webhook is more sensitive still: Stripe signs the exact bytes, so any
 * re-encoding between the socket and `constructEvent` fails verification and
 * every delivery 400s.
 *
 * No database is needed: everything asserted here is decided before the store
 * is reached, or on a path whose store write is best-effort.
 */
import Stripe from "stripe";
import { Harness } from "./_test-fakes";

const t = new Harness();

const SECRET = "whsec_test_secret_for_local_verification_only";

// Set before the route module is imported: the route builds its Stripe client
// lazily on first use and caches it. Neither value reaches a network.
process.env.STRIPE_SECRET_KEY = "placeholder-not-a-real-key";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
// An address that refuses instantly, so the best-effort store write on the
// "ignored event" path fails fast instead of hanging. Nothing asserted here
// depends on it succeeding.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "not-a-real-key";

const stripe = new Stripe("placeholder-not-a-real-key", { apiVersion: "2026-02-25.clover" });
const sign = (payload: string, secret = SECRET) => stripe.webhooks.generateTestHeaderString({ payload, secret });

function post(body: string, signature: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("https://www.houstonpremiersoccer.com/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

async function main() {
  const route = await import("../src/app/api/stripe/webhook/route");
  const POST = route.POST as unknown as (req: Request) => Promise<Response>;

  /* ------------------------------------------------------------------ */
  /* Route configuration                                                 */
  /* ------------------------------------------------------------------ */
  t.eq("the route is force-dynamic — a cached webhook would be silently wrong", route.dynamic, "force-dynamic");
  t.check(
    "it does not opt into the edge runtime, where body handling differs",
    !("runtime" in route) || (route as { runtime?: string }).runtime === "nodejs",
    `runtime: ${(route as { runtime?: string }).runtime}`
  );

  /* ------------------------------------------------------------------ */
  /* Signature, through the real Request                                 */
  /* ------------------------------------------------------------------ */
  const payload = JSON.stringify({
    id: "evt_route_1",
    object: "event",
    api_version: "2026-02-25.clover",
    type: "customer.created",
    data: { object: { id: "cus_route", object: "customer" } },
  });

  t.eq("a body signed with the wrong secret → 400", (await POST(post(payload, sign(payload, "whsec_other")))).status, 400);
  t.eq("no stripe-signature header → 400", (await POST(post(payload, null))).status, 400);
  t.eq("an empty signature header → 400", (await POST(post(payload, "")))!.status, 400);

  {
    const res = await POST(post(payload, sign(payload)));
    const body = await res.json();
    t.eq(
      "a correctly signed body verifies through the route: the raw bytes survived",
      [res.status, body.ignored, body.type],
      [200, true, "customer.created"]
    );
  }

  /* ------------------------------------------------------------------ */
  /* Raw-body fidelity                                                   */
  /* ------------------------------------------------------------------ */
  // Stripe signs the exact bytes. Anything that re-serialises, normalises line
  // endings or mangles non-ASCII between the socket and constructEvent breaks
  // verification — and would look like a configuration problem, not a code one.
  {
    const awkward = JSON.stringify({
      id: "evt_route_2",
      object: "event",
      type: "customer.created",
      data: {
        object: {
          id: "cus_awkward",
          object: "customer",
          name: "Renée O'Brien — 3rd Ward FC \\ \"quoted\"",
          note: "line one\r\nline two\nline three\ttabbed",
          emoji: "⚽️🇲🇽",
        },
      },
    });
    const res = await POST(post(awkward, sign(awkward)));
    t.eq("unicode, CRLF, tabs, backslashes and quotes all survive the route", res.status, 200);
  }

  {
    // A body Stripe did not sign must fail even if it parses to the same object:
    // proof the route verifies bytes rather than semantics.
    const original = JSON.stringify({ id: "evt_route_3", object: "event", type: "customer.created", data: { object: {} } });
    const reordered = JSON.stringify({ object: "event", id: "evt_route_3", type: "customer.created", data: { object: {} } });
    const res = await POST(post(reordered, sign(original)));
    t.eq("the same JSON with keys reordered → 400, because the bytes differ", res.status, 400);
  }

  /* ------------------------------------------------------------------ */
  /* Environment wiring                                                  */
  /* ------------------------------------------------------------------ */
  {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(post(payload, sign(payload)));
    t.eq("with STRIPE_WEBHOOK_SECRET unset the route fails closed, 400", res.status, 400);
    process.env.STRIPE_WEBHOOK_SECRET = saved;

    const back = await POST(post(payload, sign(payload)));
    t.eq("and reads the variable per request, so restoring it works without a restart", back.status, 200);
  }

  t.done();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
