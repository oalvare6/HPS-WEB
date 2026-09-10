/**
 * Offline Stripe ⇄ local payment reconciliation (F-02 Phase 4; guarded in Stage 1.4).
 *
 *   DRY RUN (default, never writes):
 *     npx tsx scripts/reconcile-payments.ts [--since-days=90] [--limit=500]
 *
 *   REPAIR ONE KNOWN RECORD — the shape this tool exists for:
 *     HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply \
 *       --registration=803e3697-4476-41ea-bdaa-afec654bdf7c \
 *       --expect-writes=1 --expect-kind=registration_pending_with_payment
 *
 *   REPAIR EVERYTHING IT PROPOSES (deliberate, and rarely what you want):
 *     HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply --all
 *
 * ## Why applying is fenced
 *
 * `--apply` used to repair every `finalize` proposal in a 90-day window. For the
 * one job it was written for — converging the known $80 record — that is far more
 * than was asked: production also holds 4 payments linked to nothing and any
 * Stripe session with no local row at all, each of which would have been written
 * by the same keystroke. The owner is not technical; a repair tool must do the
 * one thing that was intended and refuse anything else.
 *
 * So a run that writes must now say what it expects to touch:
 *   --session=cs_…            repair only these Checkout Sessions (repeatable)
 *   --registration=<uuid>     repair only discrepancies on these registrations (repeatable)
 *   --all                     no scope: repair everything proposed (must be explicit)
 *   --max-writes=N            refuse if the plan is bigger than N (default 1 when scoped)
 *   --expect-writes=N         refuse unless the plan is exactly N records
 *   --expect-kind=<kind>      refuse unless every repair is this kind (repeatable)
 *   --json=<path>            write a machine-readable record of the run
 *
 * Analysis still looks at the whole window and prints everything it finds — the
 * scope limits what may be WRITTEN, never what you get to see.
 *
 * Reads credentials from the environment only (never embedded):
 *   STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * What it detects (see src/lib/payment-reconcile.ts):
 *   payment_missing_locally               → proposes: finalize
 *   registration_pending_with_payment     → proposes: finalize   (the known F-02 shape)
 *   registration_paid_payment_inconsistent→ flags for the owner
 *   duplicate_local_payment               → flags for the owner (possible double charge)
 *   payment_unlinked                      → finalize if Stripe knows the registration, else report
 *
 * Repairs go through the same convergent path as the webhook, so running this
 * twice is a no-op the second time. Nothing here refunds, deletes, or edits a
 * registration by hand.
 */
import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkoutSessionFacts, finalizeCheckoutSession } from "../src/lib/payment-finalize";
import { SupabaseFinalizeStore } from "../src/lib/payment-finalize-store-supabase";
import {
  analyzePayments,
  applyPlan,
  planRepairs,
  type DiscrepancyKind,
  type LocalPayment,
  type LocalRegistration,
  type ReconcileSource,
  type RepairGuards,
} from "../src/lib/payment-reconcile";

function flag(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

/** Repeatable flags: --session=a --session=b */
function flags(name: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`--${name}=`))
    .map((a) => a.slice(name.length + 3))
    .filter(Boolean);
}

/** Says out loud which Stripe account and which database this run is pointed at. */
function keyMode(stripeKey: string): string {
  if (stripeKey.startsWith("sk_live_")) return "LIVE";
  if (stripeKey.startsWith("sk_test_")) return "test";
  if (stripeKey.startsWith("rk_live_")) return "LIVE (restricted)";
  if (stripeKey.startsWith("rk_test_")) return "test (restricted)";
  return "unrecognised";
}

function projectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "unknown";
  }
}

type Snapshot = {
  registrations: Record<string, LocalRegistration & { needs_admin_review?: boolean }>;
  payments: Record<string, LocalPayment>;
};

async function main() {
  const apply = flag("apply") === "true";
  const sinceDays = Number(flag("since-days") ?? "90");
  const limit = Number(flag("limit") ?? "500");
  const sessionIds = flags("session");
  const registrationIds = flags("registration");
  const all = flag("all") === "true";
  const scoped = sessionIds.length > 0 || registrationIds.length > 0;
  const jsonPath = flag("json");

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !supabaseUrl || !serviceKey) {
    console.error("Need STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(2);
  }
  if (apply && process.env.HPS_RECONCILE_APPLY !== "1") {
    console.error("--apply also requires HPS_RECONCILE_APPLY=1 in the environment. Refusing to write.");
    process.exit(2);
  }
  if (apply && !scoped && !all) {
    console.error(
      [
        "--apply with no scope would repair everything this run proposes.",
        "",
        "Name what you mean to fix:",
        "  --registration=<uuid>   repair only this registration's record",
        "  --session=cs_…          repair only this Checkout Session",
        "",
        "or say --all if you really do mean every proposal in the window.",
        "Run without --apply first and read the report.",
      ].join("\n")
    );
    process.exit(2);
  }

  const guards: RepairGuards = {
    scope: { sessionIds, registrationIds },
    // A scoped run defaults to a single record: the common case is one known
    // repair, and a scope that suddenly matches more is a reason to stop.
    maxWrites: flag("max-writes") !== null ? Number(flag("max-writes")) : scoped ? 1 : undefined,
    expectWrites: flag("expect-writes") !== null ? Number(flag("expect-writes")) : undefined,
    expectKinds: flags("expect-kind").length > 0 ? (flags("expect-kind") as DiscrepancyKind[]) : undefined,
  };

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-02-25.clover" });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const source: ReconcileSource = {
    async listPaidSessions() {
      const since = Math.floor(Date.now() / 1000) - sinceDays * 86400;
      const out = [];
      for await (const session of stripe.checkout.sessions.list({ limit: 100, status: "complete", created: { gte: since } })) {
        if (session.payment_status !== "paid" || session.mode !== "payment") continue;
        out.push(checkoutSessionFacts(session));
        if (out.length >= limit) break;
      }
      return out;
    },
    async loadPaymentsBySessionIds(ids) {
      const rows: LocalPayment[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("payments")
          .select("id, stripe_session_id, stripe_payment_intent_id, registration_id, drop_in_id, status, amount, currency")
          .in("stripe_session_id", ids.slice(i, i + 200));
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as LocalPayment[]));
      }
      return rows;
    },
    async loadRegistrations(ids) {
      const rows: LocalRegistration[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("registrations")
          .select("id, payment_status, cancelled_at, tournament_id")
          .in("id", ids.slice(i, i + 200));
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as LocalRegistration[]));
      }
      return rows;
    },
  };

  /**
   * The trap this check exists for: checkout BILLS through the Stripe Price
   * object when the event has a `stripe_price_id`
   * (src/lib/stripe-checkout.ts `line_items`), but settlement VALIDATES the
   * amount against `tournaments.entry_fee_cents`
   * (src/lib/payment-finalize.ts → `priceTournamentCheckout`). While the two
   * agree, nothing is wrong. The moment they diverge — a fee edited in the
   * admin without the Stripe Price being regenerated, or the other way round —
   * every card payment for that event charges one amount and then fails
   * validation, landing in `needs_review` with the registration NOT confirmed.
   * Nothing in the app compares them, so this is the only place it is checked.
   */
  async function reportPriceDrift() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, title, slug, entry_fee_cents, stripe_price_id")
      .not("stripe_price_id", "is", null);
    if (error) {
      console.log(`\nPricing check: skipped (${error.message})`);
      return;
    }
    const rows = (data ?? []) as { id: string; title: string; slug: string; entry_fee_cents: number | null; stripe_price_id: string }[];
    if (rows.length === 0) return;

    console.log("\nPricing check — Stripe Price vs entry_fee_cents:");
    for (const row of rows) {
      try {
        const price = await stripe.prices.retrieve(row.stripe_price_id);
        const agrees = price.unit_amount === row.entry_fee_cents && price.currency === "usd" && price.active;
        console.log(
          `  ${agrees ? "ok  " : "DRIFT"} ${row.slug.padEnd(28)} stripe=${price.unit_amount ?? "?"}${price.active ? "" : " (inactive)"} ${price.currency}  db=${row.entry_fee_cents ?? "null"}`
        );
        if (!agrees) {
          console.log(
            `        Card payments for this event will be charged the Stripe amount and then fail validation → needs_review.`
          );
        }
      } catch (err) {
        console.log(`  ERROR ${row.slug.padEnd(28)} could not read ${row.stripe_price_id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** The rows a repair would touch, exactly as they stand right now. */
  async function snapshot(regIds: string[], sessions: string[]): Promise<Snapshot> {
    const out: Snapshot = { registrations: {}, payments: {} };
    if (regIds.length > 0) {
      const { data } = await supabase
        .from("registrations")
        .select("id, payment_status, cancelled_at, tournament_id, needs_admin_review")
        .in("id", regIds);
      for (const r of data ?? []) out.registrations[(r as { id: string }).id] = r as LocalRegistration;
    }
    if (sessions.length > 0) {
      const { data } = await supabase
        .from("payments")
        .select("id, stripe_session_id, stripe_payment_intent_id, registration_id, drop_in_id, status, amount, currency")
        .in("stripe_session_id", sessions);
      for (const p of data ?? []) out.payments[(p as { stripe_session_id: string }).stripe_session_id] = p as LocalPayment;
    }
    return out;
  }

  console.log("─".repeat(72));
  console.log(`Mode          : ${apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);
  console.log(`Stripe account: ${keyMode(stripeKey)}`);
  console.log(`Database      : ${projectRef(supabaseUrl)}`);
  console.log(`Window        : ${sinceDays} days, up to ${limit} sessions`);
  console.log(
    `Scope         : ${
      scoped
        ? [...sessionIds.map((s) => `session ${s}`), ...registrationIds.map((r) => `registration ${r}`)].join(", ")
        : all
          ? "ALL proposals in the window"
          : "(analysis only)"
    }`
  );
  console.log("─".repeat(72));

  await reportPriceDrift();

  const report = await analyzePayments(source);
  console.log(
    `\nSessions checked: ${report.sessionsChecked} · consistent: ${report.consistent} · discrepancies: ${report.discrepancies.length}\n`
  );

  for (const d of report.discrepancies) {
    console.log(`${d.kind.padEnd(38)} ${d.sessionId}  reg=${d.registrationId ?? "-"}  → ${d.proposal}\n    ${d.detail}`);
  }

  const plan = planRepairs(report, guards);
  console.log(
    `\nPlan: ${plan.writes.length} to repair · ${plan.reportedOnly.length} reported only · ${plan.outOfScope.length} repairable but out of scope`
  );
  for (const w of plan.writes) console.log(`  REPAIR  ${w.kind}  ${w.sessionId}  reg=${w.registrationId ?? "-"}`);
  for (const o of plan.outOfScope) console.log(`  skip    ${o.kind}  ${o.sessionId}  (outside the scope you named)`);

  const before = await snapshot(
    plan.writes.map((w) => w.registrationId).filter((x): x is string => Boolean(x)),
    plan.writes.map((w) => w.sessionId)
  );

  const audit: Record<string, unknown> = {
    mode: apply ? "apply" : "dry-run",
    stripe_account: keyMode(stripeKey),
    database: projectRef(supabaseUrl),
    window_days: sinceDays,
    scope: { sessionIds, registrationIds, all },
    guards: { maxWrites: guards.maxWrites ?? null, expectWrites: guards.expectWrites ?? null, expectKinds: guards.expectKinds ?? null },
    sessions_checked: report.sessionsChecked,
    discrepancies: report.discrepancies,
    plan: { writes: plan.writes, reportedOnly: plan.reportedOnly, outOfScope: plan.outOfScope, refusals: plan.refusals },
    before,
  };

  if (plan.refusals.length > 0) {
    console.error("\nREFUSED:");
    for (const r of plan.refusals) console.error(`  - ${r}`);
    if (jsonPath) writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
    process.exit(3);
  }

  if (!apply) {
    console.log("\nDry run only. Nothing was written.");
    if (plan.writes.length > 0) {
      console.log("To carry out exactly the repairs listed above:");
      console.log(
        `  HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply${
          scoped ? " " + [...sessionIds.map((s) => `--session=${s}`), ...registrationIds.map((r) => `--registration=${r}`)].join(" ") : " --all"
        } --expect-writes=${plan.writes.length}`
      );
    }
    if (jsonPath) writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
    return;
  }

  console.log("\nBefore:");
  console.log(JSON.stringify(before, null, 2));

  const store = new SupabaseFinalizeStore();
  const results = await applyPlan(plan, async (sessionId) => {
    // Always re-read the session from Stripe at apply time; never trust the listing snapshot.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return finalizeCheckoutSession(checkoutSessionFacts(session), store, { eventId: null, eventType: "reconcile" });
  });

  console.log("\nRepairs:");
  for (const r of results) {
    console.log(`${r.kind.padEnd(38)} ${r.sessionId}  → ${JSON.stringify(r.outcome)}`);
  }

  const after = await snapshot(
    plan.writes.map((w) => w.registrationId).filter((x): x is string => Boolean(x)),
    plan.writes.map((w) => w.sessionId)
  );
  console.log("\nAfter:");
  console.log(JSON.stringify(after, null, 2));

  // Say plainly whether the thing you came to fix is fixed.
  for (const w of plan.writes) {
    if (!w.registrationId) continue;
    const was = before.registrations[w.registrationId]?.payment_status ?? "?";
    const now = after.registrations[w.registrationId]?.payment_status ?? "?";
    console.log(`\nregistration ${w.registrationId}: ${was} → ${now}${was === now ? "  (UNCHANGED — check the outcome above)" : ""}`);
  }

  audit.results = results;
  audit.after = after;
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
    console.log(`\nAudit record written to ${jsonPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
