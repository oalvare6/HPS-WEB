# Stage 2.3 — proposal

**Status: a proposal for the owner to accept, reorder or cut. Nothing here is started.**
It follows [STAGE-2-2-REPORT.md](STAGE-2-2-REPORT.md) and assumes its local acceptance run has
been completed and read.

Two things shape the whole proposal.

**The admin is being handed to the company owner, who is not technical.** Simplicity for that
person outranks cleverness everywhere. Every item below is judged first by whether it makes the
owner's Friday evening easier, not by whether it is interesting to build.

**Stage 2.1 deliberately shipped two honest prototypes.** Message composition and the Cash/Zelle
receipt form collect input and save nothing, and they say so. That was the right call — a button
that looks like it sent an email and did not is worse than no button. Stage 2.3 is where those
two either become real or get removed. Leaving a prototype in place indefinitely is the one
option that should not survive this stage.

## A. Cash and Zelle payments — recommended first

**The problem.** The owner takes money at the field in cash and by Zelle. Today the only way to
record that is to edit a registration's status to `paid`, which throws away everything that
matters afterwards: how much, by what method, on what date, who accepted it. When someone
disputes a payment in three weeks there is nothing to look at.

**Why first.** It is the one item where the current system loses information the business
actually needs, it is the smallest of the three, and it does not depend on anything else.

**The invariant question, which must be settled explicitly rather than assumed.** CLAUDE.md
says: *"Do not add a second writer of `payments` or of `registrations.payment_status = 'paid'`
for card money."* The words *for card money* are load-bearing. That rule exists because Stripe
settlement has to converge on replay and re-derive amounts from rows — reasoning that simply
does not apply to a human recording a $50 note. My reading is that manual non-card payments are
outside it, and that a manual receipt is a legitimate second **kind** of payment rather than a
second writer of the Stripe path.

That reading should be confirmed by the owner before code is written, because if it is wrong the
whole item changes shape. The safe design either way: manual receipts are written through their
own function, never through `finalize_checkout_payment`, and carry a method that makes them
unmistakable in the ledger.

**Sketch.** A `payment_method` and `recorded_by` on a manual receipt; amount in cents; a
timestamp that is the date the money changed hands, not the date it was typed; and a note.
Editing an existing receipt keeps history rather than overwriting. The roster's
"financially accounted for" arithmetic does not change — a manual receipt settles a
registration exactly as a card payment does.

**Open question for the owner:** should a partial cash payment (someone pays $30 of $50) set
`partial` and record $30, or stay `pending` until paid in full? The current data model supports
either; the roster already keeps `partial` separately identifiable.

## B. Resend communications — recommended second

**What already exists.** `src/lib/email/resend-sender.ts` implements a working Resend transport,
but only against the `ResumeLinkSender` contract — one-time resume links. Stage 2.3 extends a
proven sender rather than building one, which is a much smaller job than it looks.

**What Stage 2.1 prototyped.** Template selection, recipient selection and editable text, in the
overview, player lists, player detail, teams and schedule. No Send action anywhere.

**The hard parts are not the sending.** They are the parts that make sending safe for a
non-technical operator on a phone at the field:

- **Idempotency.** A reminder sent twice because the owner double-tapped is a real failure. Sends
  need a key and a record, the same discipline `stripe_webhook_events` uses.
- **A visible outcome.** Delivered, bounced, failed — and a retry that does not duplicate. A send
  whose result nobody can see is how the DocuSeal webhook went a month without ever delivering.
- **Recipient scoping.** "Everyone unpaid on this event" must mean exactly the people the roster
  shows as unpaid, computed from the same source, or the two will drift and the owner will
  believe the wrong one.
- **A dry run.** The owner should be able to see the exact list and the exact text before
  anything leaves.

**Deliberately not proposed:** scheduled or automated reminders. Get one-tap manual sending
trustworthy first; automation on top of an unproven sender multiplies the blast radius.

## C. Cross-event team constraint — small, recommended alongside

From STAGE-2-2-REPORT.md §6 and FOLLOWUPS.md: no database constraint forbids
`registrations.team_id` naming a team from a different event. The admin route checks, so nothing
is wrong today — but the invariant rests on application code alone.

This is a contained piece of work: a constraint (or a trigger, if the composite key it would need
is too invasive for Track A), plus a test. Worth doing while the isolated project exists to
prove it against, and worth doing *before* any new writer of `registrations` appears.

**Sequencing note that matters here.** CLAUDE.md's two-FK lesson applies: a migration that adds
a relationship between two tables is a breaking change to every embed between them, in **both**
deploy orders. Anything touching `registrations`' relationships gets the constraint-naming fix
shipped first, then the migration, then the feature.

## D. Review reasons — proposed, lower priority

The roster payload supplies `needsReview` as a flag with no explanation, and Stage 2.1 correctly
refuses to invent one. A reason, and a record of who resolved it and when, would make the flag
actionable. Smaller value than A or B, and it should follow the same audit pattern as A rather
than inventing a second one — which is the argument for doing it after A, not before.

## Explicitly not proposed

- **Automated or scheduled reminders** — see B.
- **A schema rewrite.** Track A avoids schema changes by design, and Stage 2.2 found nothing that
  demands one.
- **Production migration-ledger repair.** Still owed (22 rows for 41 files,
  STAGE-1-6-MIGRATION-RECONCILIATION.md §8), still separately authorised, and still not a
  prerequisite for any of the above.
- **Stripe sandbox, DocuSeal callback and Google OAuth coverage.** Real gaps, each needing its
  own isolated credentials; they are test-coverage work rather than Stage 2.3 features, and
  should be scoped separately so they are not quietly dropped.

## What I would want before starting

1. **The Stage 2.2 acceptance output**, so the UI layer is actually signed off rather than assumed.
2. **A decision on the payments invariant** in A — the *for card money* reading.
3. **An order.** My recommendation is A, then C alongside it, then B, then D: A recovers
   information the business is losing now, C is cheap and prevents a future regression, B is the
   largest and benefits from being last, D refines something that already works honestly.
