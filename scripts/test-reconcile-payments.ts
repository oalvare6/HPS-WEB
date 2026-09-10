/**
 * Reconciliation: dry-run never mutates, the known F-02 orphan is detected,
 * the expected repair is proposed, analysis is stable, and applying the
 * repair converges exactly once.
 *
 * Run: npx tsx scripts/test-reconcile-payments.ts
 */
import { finalizeCheckoutSession, type CheckoutSessionFacts } from "../src/lib/payment-finalize";
import { analyzePayments, applyPlan, applyRepairs, planRepairs, type ReconcileSource } from "../src/lib/payment-reconcile";
import { Harness, InMemoryFinalizeStore } from "./_test-fakes";

const t = new Harness();
const EVENT_ID = "5bb92b95-73f4-4e25-93dc-bd7caebcd743";
const REG_ID = "803e3697-4476-41ea-bdaa-afec654bdf7c";
const REG_OK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const SESSION_ORPHAN: CheckoutSessionFacts = {
  sessionId: "cs_live_orphan",
  paymentIntentId: "pi_orphan",
  mode: "payment",
  status: "complete",
  paymentStatus: "paid",
  amountTotal: 8000,
  currency: "usd",
  customerEmail: "player@example.com",
  clientReferenceId: null,
  metadata: { email: "player@example.com", tournament_id: EVENT_ID, registration_id: REG_ID, pay_kind: "entry" },
};
const SESSION_OK: CheckoutSessionFacts = { ...SESSION_ORPHAN, sessionId: "cs_live_ok", paymentIntentId: "pi_ok", metadata: { ...SESSION_ORPHAN.metadata, registration_id: REG_OK, email: "ok@example.com" }, customerEmail: "ok@example.com" };
const REG_MISSING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_MISSING: CheckoutSessionFacts = { ...SESSION_ORPHAN, sessionId: "cs_live_missing", paymentIntentId: "pi_missing", customerEmail: "missing@example.com", metadata: { ...SESSION_ORPHAN.metadata, registration_id: REG_MISSING, email: "missing@example.com" } };

function fixture() {
  const s = new InMemoryFinalizeStore();
  s.tournaments.set(EVENT_ID, { id: EVENT_ID, title: "Community Cup", slug: "community-cup-fall-2026", entry_fee_cents: 8000, drop_in_fee_cents: 0, stripe_price_id: null });
  s.registrations.set(REG_ID, { id: REG_ID, email: "player@example.com", tournament_id: EVENT_ID, contact_id: null, payment_status: "pending", cancelled_at: null, needs_admin_review: false, notes: null, team_name: null });
  s.registrations.set(REG_OK, { id: REG_OK, email: "ok@example.com", tournament_id: EVENT_ID, contact_id: null, payment_status: "paid", cancelled_at: null, needs_admin_review: false, notes: null, team_name: null });
  s.registrations.set(REG_MISSING, { id: REG_MISSING, email: "missing@example.com", tournament_id: EVENT_ID, contact_id: null, payment_status: "pending", cancelled_at: null, needs_admin_review: false, notes: null, team_name: null });
  // The F-02 shape: succeeded $80 payment row linked to a still-pending registration.
  s.payments.set("cs_live_orphan", { id: "bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7", stripe_session_id: "cs_live_orphan", stripe_payment_intent_id: "pi_orphan", registration_id: REG_ID, drop_in_id: null, tournament_id: EVENT_ID, contact_id: null, email: "player@example.com", amount: 80, currency: "usd", status: "succeeded", notes: null });
  // A healthy one.
  s.payments.set("cs_live_ok", { id: "pay_ok", stripe_session_id: "cs_live_ok", stripe_payment_intent_id: "pi_ok", registration_id: REG_OK, drop_in_id: null, tournament_id: EVENT_ID, contact_id: null, email: "ok@example.com", amount: 80, currency: "usd", status: "succeeded", notes: null });
  return s;
}

function sourceFor(s: InMemoryFinalizeStore, sessions: CheckoutSessionFacts[]): ReconcileSource {
  return {
    async listPaidSessions() {
      return sessions;
    },
    async loadPaymentsBySessionIds(ids) {
      return [...s.payments.values()].filter((p) => ids.includes(p.stripe_session_id)).map((p) => ({ ...p }));
    },
    async loadRegistrations(ids) {
      return ids.map((id) => s.registrations.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)).map((r) => ({ id: r.id, payment_status: r.payment_status, cancelled_at: r.cancelled_at, tournament_id: r.tournament_id }));
    },
  };
}

async function main() {
  const s = fixture();
  const sessions = [SESSION_ORPHAN, SESSION_OK, SESSION_MISSING];
  const before = s.snapshot();

  const report = await analyzePayments(sourceFor(s, sessions));
  t.check("dry-run analysis never mutates", s.snapshot() === before);
  t.eq("three sessions checked, one consistent", [report.sessionsChecked, report.consistent], [3, 1]);

  const orphan = report.discrepancies.find((d) => d.sessionId === "cs_live_orphan");
  t.eq("known orphan detected as registration_pending_with_payment", orphan?.kind, "registration_pending_with_payment");
  t.eq("expected repair proposed: finalize", orphan?.proposal, "finalize");
  t.eq("orphan names the registration", orphan?.registrationId, REG_ID);

  const missing = report.discrepancies.find((d) => d.sessionId === "cs_live_missing");
  t.eq("Stripe payment absent locally detected", [missing?.kind, missing?.proposal], ["payment_missing_locally", "finalize"]);

  const again = await analyzePayments(sourceFor(s, sessions));
  t.check("repeated analysis is stable", JSON.stringify(again) === JSON.stringify(report) && s.snapshot() === before);

  // Apply through the convergent finaliser.
  const finalize = (sessionId: string) => {
    const facts = sessions.find((x) => x.sessionId === sessionId)!;
    return finalizeCheckoutSession(facts, s, { eventId: null, eventType: "reconcile" });
  };
  const results = await applyRepairs(report, finalize);
  t.eq("two repairs applied, none skipped", results.filter((r) => r.outcome.status === "finalized").length, 2);
  t.eq("orphan registration converged to paid", s.registrations.get(REG_ID)!.payment_status, "paid");
  t.eq("orphan payment row was NOT duplicated (same id)", [s.payments.size, s.payments.get("cs_live_orphan")!.id], [3, "bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7"]);
  t.check("missing payment now recorded", s.payments.has("cs_live_missing"));

  const afterRepair = s.snapshot();
  const clean = await analyzePayments(sourceFor(s, sessions));
  t.eq("after repair everything is consistent", [clean.discrepancies.length, clean.consistent], [0, 3]);
  const secondRun = await applyRepairs(clean, finalize);
  t.check("second apply run is a no-op", secondRun.length === 0 && s.snapshot() === afterRepair);

  // Duplicate local payment detection.
  s.payments.set("cs_live_dup", { id: "pay_dup", stripe_session_id: "cs_live_dup", stripe_payment_intent_id: "pi_dup", registration_id: REG_OK, drop_in_id: null, tournament_id: EVENT_ID, contact_id: null, email: "ok@example.com", amount: 80, currency: "usd", status: "succeeded", notes: null });
  const dupSession: CheckoutSessionFacts = { ...SESSION_OK, sessionId: "cs_live_dup", paymentIntentId: "pi_dup" };
  const dupReport = await analyzePayments(sourceFor(s, [SESSION_OK, dupSession]));
  t.eq("two succeeded payments for one registration → duplicate flagged for admin, never auto-repaired", dupReport.discrepancies.map((d) => [d.kind, d.proposal]), [["duplicate_local_payment", "flag_for_admin"]]);

  /* ------------------------------------------------------------------ */
  /* Guards (Stage 1.4): a repair run must say what it expects to touch  */
  /* ------------------------------------------------------------------ */
  {
    const fresh = fixture();
    const wide = await analyzePayments(sourceFor(fresh, sessions));
    t.eq("unscoped, this window proposes two repairs", planRepairs(wide).writes.length, 2);

    const scoped = planRepairs(wide, { scope: { registrationIds: [REG_ID] } });
    t.eq("scoping to the known registration narrows the plan to one", scoped.writes.length, 1);
    t.eq("...and it is the record we came for", [scoped.writes[0].sessionId, scoped.writes[0].kind], [
      "cs_live_orphan",
      "registration_pending_with_payment",
    ]);
    t.eq("the other repairable record is reported as out of scope, not silently dropped", scoped.outOfScope.length, 1);
    t.eq("a scoped plan carries no refusal", scoped.refusals, []);

    const bySession = planRepairs(wide, { scope: { sessionIds: ["cs_live_orphan"] } });
    t.eq("scoping by session id reaches the same one record", bySession.writes.map((w) => w.sessionId), ["cs_live_orphan"]);

    const capped = planRepairs(wide, { maxWrites: 1 });
    t.eq("a plan bigger than --max-writes is refused", capped.refusals.length, 1);
    t.check("the refusal says how to narrow it", capped.refusals[0].includes("--session/--registration"));

    const wrongCount = planRepairs(wide, { scope: { registrationIds: [REG_ID] }, expectWrites: 2 });
    t.eq("--expect-writes disagreeing with reality is refused", wrongCount.refusals.length, 1);

    const wrongKind = planRepairs(wide, {
      scope: { registrationIds: [REG_ID] },
      expectKinds: ["payment_missing_locally"],
    });
    t.eq("--expect-kind disagreeing with reality is refused", wrongKind.refusals.length, 1);

    const exact = planRepairs(wide, {
      scope: { registrationIds: [REG_ID] },
      maxWrites: 1,
      expectWrites: 1,
      expectKinds: ["registration_pending_with_payment"],
    });
    t.eq("the full runbook invocation for the known record passes every guard", exact.refusals, []);

    // The guards are not advisory: applying a refused plan is impossible.
    const beforeGuarded = fresh.snapshot();
    let threw = false;
    try {
      await applyPlan(capped, finalize);
    } catch {
      threw = true;
    }
    t.check("applyPlan refuses a plan that carries a refusal", threw);
    t.check("and wrote nothing while refusing", fresh.snapshot() === beforeGuarded);

    // The scoped repair writes the one record and leaves the other alone.
    const scopedFinalize = (sessionId: string) => {
      const facts = sessions.find((x) => x.sessionId === sessionId)!;
      return finalizeCheckoutSession(facts, fresh, { eventId: null, eventType: "reconcile" });
    };
    await applyPlan(exact, scopedFinalize);
    t.eq("the known registration converged", fresh.registrations.get(REG_ID)!.payment_status, "paid");
    t.check("the out-of-scope session was not written", !fresh.payments.has("cs_live_missing"));
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
