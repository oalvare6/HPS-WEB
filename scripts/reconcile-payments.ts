/**
 * Offline Stripe ⇄ local payment reconciliation (F-02, Phase 4).
 *
 *   DRY RUN (default, never writes):
 *     npx tsx scripts/reconcile-payments.ts [--since-days=90] [--limit=500]
 *
 *   APPLY (writes through finalize_checkout_payment; requires BOTH the flag
 *   and the environment variable so nobody applies by accident):
 *     HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply
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
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { checkoutSessionFacts, finalizeCheckoutSession } from "../src/lib/payment-finalize";
import { SupabaseFinalizeStore } from "../src/lib/payment-finalize-store-supabase";
import {
  analyzePayments,
  applyRepairs,
  type LocalPayment,
  type LocalRegistration,
  type ReconcileSource,
} from "../src/lib/payment-reconcile";

function flag(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

async function main() {
  const apply = flag("apply") === "true";
  const sinceDays = Number(flag("since-days") ?? "90");
  const limit = Number(flag("limit") ?? "500");

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

  console.log(`Mode: ${apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"} · window: ${sinceDays} days · limit ${limit}`);
  const report = await analyzePayments(source);
  console.log(`Sessions checked: ${report.sessionsChecked} · consistent: ${report.consistent} · discrepancies: ${report.discrepancies.length}\n`);

  for (const d of report.discrepancies) {
    console.log(`${d.kind.padEnd(38)} ${d.sessionId}  reg=${d.registrationId ?? "-"}  → ${d.proposal}\n    ${d.detail}`);
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply (and HPS_RECONCILE_APPLY=1) to reprocess the 'finalize' proposals.");
    return;
  }

  const store = new SupabaseFinalizeStore();
  const results = await applyRepairs(report, async (sessionId) => {
    // Always re-read the session from Stripe at apply time; never trust the listing snapshot.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return finalizeCheckoutSession(checkoutSessionFacts(session), store, { eventId: null, eventType: "reconcile" });
  });

  console.log("\nRepairs:");
  for (const r of results) {
    console.log(`${r.kind.padEnd(38)} ${r.sessionId}  → ${JSON.stringify(r.outcome)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
