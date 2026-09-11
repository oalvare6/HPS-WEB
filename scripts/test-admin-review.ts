/**
 * Stage 2.3 D — review reasons and the Resolve rule, without Postgres.
 *
 * What is proved here:
 *   - every sentence the seven writers append is recognised, worded for the
 *     owner, and paired with an action (the SQL suites pin the literals on the
 *     writing side; this pins the reading side, so neither can drift alone);
 *   - the live check names each unsafe condition from the rows, not the notes;
 *   - resolving appends a dated line and clears the flag, removes nothing,
 *     and is refused while something is still unsafe unless the owner
 *     acknowledges it in writing — in which case the line records both;
 *   - a resolved flag that comes back reads as "flagged again", and an
 *     unflagged row is never touched.
 *
 * Run: npx tsx scripts/test-admin-review.ts
 */
import {
  CAPTAIN_PAID_NOTE,
  DEFAULT_RESOLUTION_TEXT,
  DUPLICATE_CONTACT_NOTE,
  LEGACY_REASON,
  appendNoteLine,
  hasReviewContent,
  liveConditions,
  parseReviewNotes,
  reasonFromNoteLine,
  resolutionFromNoteLine,
  resolutionLine,
  resolveReview,
  reviewView,
  type ReviewCode,
  type ReviewFacts,
  type ReviewRecord,
  type ReviewStore,
} from "../src/lib/admin-review";
import { reviewSummary } from "../src/components/admin/workspace";
import type { RosterRow } from "../src/lib/admin-roster";
import { Harness } from "./_test-fakes";

const t = new Harness();
const NOW = new Date("2026-09-11T15:04:05.000Z");

const SAFE: ReviewFacts = {
  paymentStatus: "paid",
  cancelledAt: null,
  cardPaymentSucceeded: false,
  offlineTotalCents: 0,
  distinctContactMatches: 1,
};

/* ------------------------------------------------------------------ */
/* 1. Every writer's sentence is recognised                            */
/* ------------------------------------------------------------------ */

// The exact strings the SQL functions and app routes write today. If a writer
// changes its wording, this table and the SQL suites both have to change.
const WRITER_LINES: Array<{ source: string; line: string; code: ReviewCode }> = [
  {
    source: "finalize_checkout_payment 4c: paid after cancel",
    line: "Stripe payment received AFTER this spot was cancelled — refund decision needed.",
    code: "stripe_paid_after_cancel",
  },
  {
    source: "finalize_checkout_payment 4c: paid on waived",
    line: "Stripe payment received for a registration marked waived — review.",
    code: "stripe_paid_on_waived_or_refunded",
  },
  {
    source: "finalize_checkout_payment 4c: paid on refunded",
    line: "Stripe payment received for a registration marked refunded — review.",
    code: "stripe_paid_on_waived_or_refunded",
  },
  {
    source: "finalize_checkout_payment 4c: confirm=false (app review_note)",
    line: "Stripe session cs_test_80: amount_mismatch: got 8000, authorised 9000",
    code: "stripe_unvalidated",
  },
  {
    source: "finalize_checkout_payment 4a-bis: ghost drop-in",
    line: "Stripe session named drop-in 33333333-3333-4333-8333-333333333333, which no longer exists — payment recorded unlinked.",
    code: "stripe_unvalidated",
  },
  {
    source: "finalize_checkout_payment 4c: fallback",
    line: "Stripe payment could not be matched to this registration — review.",
    code: "stripe_unvalidated",
  },
  {
    source: "record_manual_payment: card collision",
    line: "Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment.",
    code: "offline_double_payment",
  },
  {
    source: "record_manual_payment: cancelled spot",
    line: "Offline payment recorded AFTER this spot was cancelled — refund decision needed.",
    code: "offline_after_cancel",
  },
  { source: "captain-paid-ack route", line: CAPTAIN_PAID_NOTE, code: "captain_paid_claim" },
  { source: "linkRegistrationToContact (Stage 2.3 D)", line: DUPLICATE_CONTACT_NOTE, code: "duplicate_contact" },
];

for (const w of WRITER_LINES) {
  const reason = reasonFromNoteLine(w.line);
  t.check(`${w.source}: recognised as ${w.code}`, reason?.code === w.code, JSON.stringify(reason));
  t.check(`${w.source}: has an action for the owner`, Boolean(reason?.action && reason.action.length > 20));
  t.check(`${w.source}: the raw line is kept as detail`, reason?.detail === w.line);
  t.check(`${w.source}: the owner's sentence is not the raw line`, Boolean(reason?.text) && reason?.text !== w.line);
}

t.eq(
  "amount mismatch is worded in dollars",
  reasonFromNoteLine("Stripe session cs_1: amount_mismatch: got 8000, expected 9000")?.text,
  "The card was charged $80.00 but this event's price was $90.00."
);

for (const other of [
  "Walk-in added from the roster screen.",
  "Removed from the roster by an admin.",
  "Paid $80.00 — the price quoted when checkout started. This event now charges $90.00.",
  "World Cup: paying roster share (7 players).",
  "Retired during contact merge 2026-09-10: duplicate spot for the same person on this event.",
  "",
  "   ",
]) {
  t.check(`not a review line: ${JSON.stringify(other).slice(0, 40)}`, reasonFromNoteLine(other) === null);
}

/* ------------------------------------------------------------------ */
/* 2. Resolution lines round-trip                                       */
/* ------------------------------------------------------------------ */

{
  const plain = resolutionLine(NOW, "Merged the duplicates", []);
  t.eq("plain resolution line", plain, "Review resolved 2026-09-11T15:04:05.000Z — Merged the duplicates");
  t.eq("plain line parses back", resolutionFromNoteLine(plain), {
    at: "2026-09-11T15:04:05.000Z",
    text: "Merged the duplicates",
    despite: [],
  });

  const empty = resolutionLine(NOW, "   ", []);
  t.check("an empty note gets the default wording", empty.endsWith(`— ${DEFAULT_RESOLUTION_TEXT}`));

  const multi = resolutionLine(NOW, "line one\r\nline two", []);
  t.check("a multi-line note is folded onto one line", !multi.includes("\n") && multi.endsWith("— line one line two"));

  const despite = resolutionLine(NOW, "Refunded in Stripe — receipt #4; done", [
    { code: "stripe_paid_after_cancel", text: "This spot is cancelled, a card payment is on record, and the status is Paid rather than Refunded.", action: "" },
    { code: "duplicate_contact", text: "2 People records still match this email or phone.", action: "" },
  ]);
  const parsed = resolutionFromNoteLine(despite);
  t.eq("despite: both conditions survive the round trip", parsed?.despite, [
    "This spot is cancelled, a card payment is on record, and the status is Paid rather than Refunded.",
    "2 People records still match this email or phone.",
  ]);
  t.eq("despite: the owner's text survives, dashes and semicolons included", parsed?.text, "Refunded in Stripe — receipt #4; done");

  t.check("a note line that is not a resolution does not parse as one", resolutionFromNoteLine(CAPTAIN_PAID_NOTE) === null);
  t.check("a resolution line is never mistaken for a reason", reasonFromNoteLine(plain) === null);
}

/* ------------------------------------------------------------------ */
/* 3. Reading notes: current vs earlier vs history                      */
/* ------------------------------------------------------------------ */

{
  const notes = [
    "Walk-in added from the roster screen.",
    DUPLICATE_CONTACT_NOTE,
    resolutionLine(new Date("2026-09-01T10:00:00.000Z"), "Merged", []),
    "Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment.",
  ].join("\n");
  const parsed = parseReviewNotes(notes);
  t.eq("current = lines after the last resolution", parsed.current.map((r) => r.code), ["offline_double_payment"]);
  t.eq("earlier = lines before it", parsed.earlier.map((r) => r.code), ["duplicate_contact"]);
  t.eq("history = every resolution", parsed.history.map((h) => h.text), ["Merged"]);
  t.eq("CRLF notes read the same", parseReviewNotes(notes.replace(/\n/g, "\r\n")).current.length, 1);
  t.eq("null notes read as nothing", parseReviewNotes(null), { current: [], earlier: [], history: [] });
}

/* ------------------------------------------------------------------ */
/* 4. The live check names each unsafe condition from the rows          */
/* ------------------------------------------------------------------ */

const codes = (facts: Partial<ReviewFacts>, opts?: { captainClaimOpen?: boolean }) =>
  liveConditions({ ...SAFE, ...facts }, opts).map((c) => c.code);

t.eq("nothing unsafe on a settled row", codes({}), []);
t.eq("card payment after cancel", codes({ cancelledAt: "2026-09-01", cardPaymentSucceeded: true }), ["stripe_paid_after_cancel"]);
t.eq("offline receipt after cancel", codes({ cancelledAt: "2026-09-01", offlineTotalCents: 2000, paymentStatus: "partial" }), ["offline_after_cancel"]);
t.eq(
  "both kinds of money after cancel: each named, plus the double payment",
  codes({ cancelledAt: "2026-09-01", cardPaymentSucceeded: true, offlineTotalCents: 500 }).sort(),
  ["stripe_paid_after_cancel", "offline_double_payment", "offline_after_cancel"].sort()
);
t.eq("cancelled and refunded is settled", codes({ cancelledAt: "2026-09-01", cardPaymentSucceeded: true, paymentStatus: "refunded" }), []);
t.eq("card money on a waived spot", codes({ cardPaymentSucceeded: true, paymentStatus: "waived" }), ["stripe_paid_on_waived_or_refunded"]);
t.eq("card money on a refunded spot is informational, not unsafe", codes({ cardPaymentSucceeded: true, paymentStatus: "refunded" }), []);
t.eq("card money but still pending", codes({ cardPaymentSucceeded: true, paymentStatus: "pending" }), ["stripe_unvalidated"]);
t.eq("card money but still partial", codes({ cardPaymentSucceeded: true, paymentStatus: "partial" }), ["stripe_unvalidated"]);
t.eq("card and offline money together", codes({ cardPaymentSucceeded: true, offlineTotalCents: 8000 }), ["offline_double_payment"]);
t.eq("voided receipts do not count", codes({ cardPaymentSucceeded: true, offlineTotalCents: 0 }), []);
t.eq("two People records still match", codes({ distinctContactMatches: 2 }), ["duplicate_contact"]);
t.eq("one People record is fine", codes({ distinctContactMatches: 1 }), []);
t.eq("captain claim open while pending", codes({ paymentStatus: "pending" }, { captainClaimOpen: true }), ["captain_paid_claim"]);
t.eq("captain claim closed once paid", codes({ paymentStatus: "paid" }, { captainClaimOpen: true }), []);
t.eq("captain claim only counts when the note says so", codes({ paymentStatus: "pending" }), []);
t.check(
  "every live condition carries an action",
  liveConditions({ ...SAFE, cancelledAt: "x", cardPaymentSucceeded: true, offlineTotalCents: 1, distinctContactMatches: 3, paymentStatus: "pending" }, { captainClaimOpen: true })
    .every((c) => c.action.length > 20)
);

/* ------------------------------------------------------------------ */
/* 5. The view                                                          */
/* ------------------------------------------------------------------ */

{
  const legacy = reviewView({ needsReview: true, notes: null, facts: SAFE });
  t.check("legacy flag with no note: open, no reasons, not 'again'", legacy.open && legacy.reasons.length === 0 && !legacy.flaggedAgain);
  t.eq("legacy flag with no note: nothing live", legacy.live, []);

  const fresh = reviewView({ needsReview: true, notes: DUPLICATE_CONTACT_NOTE, facts: { ...SAFE, distinctContactMatches: 2 } });
  t.eq("fresh flag: the reason from notes", fresh.reasons.map((r) => r.code), ["duplicate_contact"]);
  t.eq("fresh flag: the same thing is live", fresh.live.map((r) => r.code), ["duplicate_contact"]);

  const again = reviewView({
    needsReview: true,
    notes: [DUPLICATE_CONTACT_NOTE, resolutionLine(NOW, "Merged", [])].join("\n"),
    facts: { ...SAFE, cardPaymentSucceeded: true, paymentStatus: "pending" },
  });
  t.check("flag back after a resolution with no new line: flaggedAgain", again.open && again.flaggedAgain);
  t.eq("flag back: the live check still explains it", again.live.map((r) => r.code), ["stripe_unvalidated"]);
  t.eq("flag back: the old reason is history, not current", again.earlier.map((r) => r.code), ["duplicate_contact"]);

  const closed = reviewView({ needsReview: false, notes: [CAPTAIN_PAID_NOTE, resolutionLine(NOW, "Confirmed with captain", [])].join("\n"), facts: { ...SAFE, paymentStatus: "pending" } });
  t.check("closed flag: not open, no live check even if the rows look odd", !closed.open && closed.live.length === 0);
  t.check("closed flag still has content to show (history)", hasReviewContent(closed));
  t.check("never flagged, no notes: nothing to show", !hasReviewContent(reviewView({ needsReview: false, notes: "Walk-in added from the roster screen.", facts: SAFE })));
  t.check("LEGACY_REASON is worded for the owner", LEGACY_REASON.code === "unknown" && LEGACY_REASON.action.length > 20);
}

/* ------------------------------------------------------------------ */
/* 6. The list summary                                                  */
/* ------------------------------------------------------------------ */

{
  const base: RosterRow = {
    id: "r", role: "player", contactId: null, firstName: "A", lastName: "B", phone: null, email: null,
    teamId: null, teamName: null, teamColor: null, waiverOk: true, waiverEvidence: "signed", waiverExpiresAt: null,
    paid: true, paymentStatus: "paid", paymentMethod: null, needsReview: false, review: null, cancelledAt: null,
    missing: [], emergencyName: null, emergencyPhone: null, createdAt: "2026-09-10",
  };
  t.eq("summary: unflagged row says nothing", reviewSummary(base), null);
  t.eq("summary: flagged with no view", reviewSummary({ ...base, needsReview: true }), "Flagged before reasons were recorded.");
  const view = reviewView({ needsReview: true, notes: CAPTAIN_PAID_NOTE, facts: { ...SAFE, paymentStatus: "pending" } });
  t.check("summary: live outranks the written reason", reviewSummary({ ...base, needsReview: true, review: view })?.startsWith("The captain-paid claim has not been confirmed") === true);
  const written = reviewView({ needsReview: true, notes: CAPTAIN_PAID_NOTE, facts: SAFE });
  t.eq("summary: the written reason when nothing is live", reviewSummary({ ...base, needsReview: true, review: written }), "The player said their captain had already paid the $960 team fee.");
  const again = reviewView({ needsReview: true, notes: resolutionLine(NOW, "x", []), facts: SAFE });
  t.eq("summary: flagged again", reviewSummary({ ...base, needsReview: true, review: again }), "Flagged again after it was resolved.");
}

/* ------------------------------------------------------------------ */
/* 7. Resolving, against an in-memory store                             */
/* ------------------------------------------------------------------ */

class MemoryStore implements ReviewStore {
  rows = new Map<string, { needsReview: boolean; notes: string | null; facts: ReviewFacts }>();
  writes = 0;
  /** Simulates a writer racing the owner: applied just before `clear` checks. */
  raceOnClear: ((row: { needsReview: boolean; notes: string | null }) => void) | null = null;

  async load(id: string): Promise<ReviewRecord | null> {
    const r = this.rows.get(id);
    return r ? { needsReview: r.needsReview, notes: r.notes, facts: r.facts } : null;
  }
  async clear(id: string, expect: { notes: string | null }, next: { notes: string }): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r) return false;
    if (this.raceOnClear) {
      this.raceOnClear(r);
      this.raceOnClear = null;
    }
    if (!r.needsReview || r.notes !== expect.notes) return false;
    r.needsReview = false;
    r.notes = next.notes;
    this.writes += 1;
    return true;
  }
}

const ID = "11111111-1111-4111-8111-111111111111";

async function main() {
  // 7a. Clean resolve: flag cleared, line appended, nothing removed.
  {
    const store = new MemoryStore();
    const before = ["Walk-in added from the roster screen.", DUPLICATE_CONTACT_NOTE].join("\n");
    store.rows.set(ID, { needsReview: true, notes: before, facts: SAFE });
    const res = await resolveReview(store, { registrationId: ID, resolution: "Same person, merged", acknowledge: false, now: NOW });
    t.check("clean resolve succeeds", res.ok, JSON.stringify(res));
    const row = store.rows.get(ID)!;
    t.check("flag is cleared", row.needsReview === false);
    t.check("every earlier line is still there", row.notes!.startsWith(before + "\n"));
    t.check("the dated line is appended", row.notes!.endsWith("Review resolved 2026-09-11T15:04:05.000Z — Same person, merged"));
    if (res.ok) {
      t.check("the returned view is closed with one history entry", !res.view.open && res.view.history.length === 1 && res.view.history[0].at === NOW.toISOString());
      t.eq("the reason moved to history", res.view.earlier.map((r) => r.code), ["duplicate_contact"]);
    }
  }

  // 7b. Resolving twice: the same text twice is two lines (no dedupe).
  {
    const store = new MemoryStore();
    store.rows.set(ID, { needsReview: true, notes: null, facts: SAFE });
    await resolveReview(store, { registrationId: ID, resolution: "Looked", acknowledge: false, now: NOW });
    store.rows.get(ID)!.needsReview = true; // a writer raised it again
    const later = new Date("2026-09-12T09:00:00.000Z");
    const res = await resolveReview(store, { registrationId: ID, resolution: "Looked", acknowledge: false, now: later });
    t.check("second resolution with the same words is accepted", res.ok);
    t.eq("both resolution lines are kept, in order", parseReviewNotes(store.rows.get(ID)!.notes).history.map((h) => h.at), [NOW.toISOString(), later.toISOString()]);
    t.check("an empty note still writes a line", (await (async () => {
      store.rows.get(ID)!.needsReview = true;
      const r = await resolveReview(store, { registrationId: ID, resolution: "", acknowledge: false, now: later });
      return r.ok && r.line.endsWith(DEFAULT_RESOLUTION_TEXT);
    })()));
  }

  // 7c. Still unsafe: refused with the list, nothing written.
  {
    const store = new MemoryStore();
    const notes = "Stripe payment received AFTER this spot was cancelled — refund decision needed.";
    store.rows.set(ID, { needsReview: true, notes, facts: { ...SAFE, cancelledAt: "2026-09-01T00:00:00.000Z", cardPaymentSucceeded: true } });
    const res = await resolveReview(store, { registrationId: ID, resolution: "done", acknowledge: false, now: NOW });
    t.check("refused while the condition is live", !res.ok && res.status === 409 && res.code === "still_unsafe", JSON.stringify(res));
    t.eq("the refusal names what is still wrong", !res.ok ? res.live?.map((l) => l.code) : [], ["stripe_paid_after_cancel"]);
    t.check("nothing was written", store.writes === 0 && store.rows.get(ID)!.needsReview && store.rows.get(ID)!.notes === notes);

    // Acknowledge without a note: still refused, told why.
    const noNote = await resolveReview(store, { registrationId: ID, resolution: "  ", acknowledge: true, now: NOW });
    t.check("acknowledging without saying what you did is refused", !noNote.ok && noNote.status === 400 && noNote.code === "note_required");
    t.check("still nothing written", store.writes === 0);

    // Acknowledge with a note: cleared, and the line says what was still wrong.
    const ack = await resolveReview(store, { registrationId: ID, resolution: "Refunded in Stripe on Friday", acknowledge: true, now: NOW });
    t.check("acknowledged resolve succeeds", ack.ok, JSON.stringify(ack));
    const row = store.rows.get(ID)!;
    t.check("flag cleared after acknowledgement", row.needsReview === false);
    const last = parseReviewNotes(row.notes).history.at(-1);
    t.eq("the line records what was still open", last?.despite, ["This spot is cancelled, a card payment is on record, and the status is Paid rather than Refunded."]);
    t.eq("and what the owner said", last?.text, "Refunded in Stripe on Friday");
    t.check("the original reason is preserved", row.notes!.startsWith(notes + "\n"));
  }

  // 7d. Once the condition is fixed in the data, no acknowledgement is needed.
  {
    const store = new MemoryStore();
    store.rows.set(ID, { needsReview: true, notes: DUPLICATE_CONTACT_NOTE, facts: { ...SAFE, distinctContactMatches: 2 } });
    const refused = await resolveReview(store, { registrationId: ID, resolution: "", acknowledge: false, now: NOW });
    t.check("two People records: refused", !refused.ok && refused.code === "still_unsafe");
    store.rows.get(ID)!.facts = { ...SAFE, distinctContactMatches: 1 }; // the owner merged them
    const ok = await resolveReview(store, { registrationId: ID, resolution: "", acknowledge: false, now: NOW });
    t.check("after the merge: resolves without acknowledgement", ok.ok && !ok.line.includes("despite"));
  }

  // 7e. Refusals that write nothing: unknown row, unflagged row, too long.
  {
    const store = new MemoryStore();
    store.rows.set(ID, { needsReview: false, notes: "Walk-in added from the roster screen.", facts: SAFE });
    const missing = await resolveReview(store, { registrationId: "22222222-2222-4222-8222-222222222222", resolution: "", acknowledge: false, now: NOW });
    t.check("unknown registration: 404", !missing.ok && missing.status === 404);
    const unflagged = await resolveReview(store, { registrationId: ID, resolution: "x", acknowledge: true, now: NOW });
    t.check("unflagged registration: 409 not_flagged", !unflagged.ok && unflagged.status === 409 && unflagged.code === "not_flagged");
    t.check("unflagged registration: untouched", store.writes === 0 && store.rows.get(ID)!.notes === "Walk-in added from the roster screen.");
    store.rows.get(ID)!.needsReview = true;
    const long = await resolveReview(store, { registrationId: ID, resolution: "x".repeat(501), acknowledge: false, now: NOW });
    t.check("over-long note: 400 before any read", !long.ok && long.status === 400 && long.code === "too_long");
  }

  // 7f. A writer racing the owner: the clear is refused, nothing lost.
  {
    const store = new MemoryStore();
    store.rows.set(ID, { needsReview: true, notes: DUPLICATE_CONTACT_NOTE, facts: SAFE });
    store.raceOnClear = (row) => {
      row.notes = appendNoteLine(row.notes, "Offline payment recorded AFTER this spot was cancelled — refund decision needed.");
    };
    const res = await resolveReview(store, { registrationId: ID, resolution: "merged", acknowledge: false, now: NOW });
    t.check("concurrent note: 409 changed", !res.ok && res.status === 409 && res.code === "changed", JSON.stringify(res));
    const row = store.rows.get(ID)!;
    t.check("concurrent note: flag still up, new line kept, no resolution written", row.needsReview && row.notes!.includes("Offline payment recorded AFTER") && !row.notes!.includes("Review resolved"));
  }

  console.log("\nadmin review: every writer's sentence is read back with an action, the live check");
  console.log("  is the rows' answer not the notes', and a flag never clears while something is unsafe");
  console.log("  unless the owner says in writing that they handled it.");
  t.done();
}

void main();
