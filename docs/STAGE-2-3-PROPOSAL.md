# Stage 2.3 — proposal

> **Accepted 2026-09-11. A, C, B and D are now all built and validated against `hps-dev`.**
>
> **D (review reasons) shipped 2026-09-11, without a migration.** See §D below for the design and
> the one trade-off it carries.
>
> **B (Resend) shipped 2026-09-11.** `supabase/migrations/20260911120000` adds `message_batches`
> and `message_recipients`; `src/lib/email/message-sender.ts` extends the transport the operator
> already chose; the Stage 2.1 composer can now actually send. The three guarantees the proposal
> named are enforced in SQL and executed by `scripts/test-messages-sql.ts` (30 checks): a repeated
> idempotency key returns the first batch and queues nobody again, one address gets one row per
> batch, and a row already `sent` is never re-sent — so Retry touches only failures.
> `scripts/test-admin-messages.ts` (48 checks) covers audience resolution and rendering, including
> that "everyone unpaid" uses the same `isFinanciallySettled` the roster displays, now a single
> exported definition rather than a copy in the roster route.
>
> Two limits stated rather than hidden. **Nothing can actually be delivered from `hps-dev`**: the
> Stage 2.2 launcher strips `RESEND_*` by design, so the unconfigured path records every recipient
> as `failed` with `email_provider_not_configured` and sends nothing — deliberately, rather than
> pretending. Real delivery needs a Resend key and a verified domain, which is your call.
> And **`sent` means the provider accepted it, not that it arrived**; there is no bounce webhook
> yet, `provider_id` is stored so one can reconcile later, and the UI says so in those words.
>
> Scheduled and automated reminders remain out of scope, as proposed.
>
> The owner settled the invariant question this document said had to be settled first: the
> "no second writer" rule governs **Stripe/card money**. Stripe stays authoritative for card
> settlement, manual actions never overwrite or fabricate Stripe payment state, and offline
> money — which Stripe has no record of — gets its own admin-controlled path preserving amount,
> method, received date, notes and who recorded it, with an auditable history rather than a
> flipped status.
>
> **What shipped for A and C:** `supabase/migrations/20260911090000` (the cross-event team
> trigger) and `20260911091000` (the `manual_payments` table and its writers), applied to
> `hps-dev` only; `POST/GET /api/admin/registrations/[id]/manual-payments` and the void route;
> and the Stage 2.1 Cash/Zelle prototype replaced in place by a working form — an integration
> change in the same component, not a redesign. `scripts/test-manual-payments-sql.ts` executes
> the rules against a real PostgreSQL: 28 checks, all passing.
>
> Production has neither migration. The from-empty suite lists both as FRESH-ONLY against the
> production catalog, with the reason, exactly as CLAUDE.md prescribes.

**Status of the rest: a proposal for the owner to accept, reorder or cut.**
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

## D. Review reasons — DONE 2026-09-11

As proposed: the roster payload supplied `needsReview` as a flag with no explanation, and Stage 2.1
correctly refused to invent one. The audit before building found the flag had **seven writers and
no clearer**: the signup contact-collision step (no note at all), the World Cup captain-paid
acknowledgement, three branches of `finalize_checkout_payment` and two of `record_manual_payment`
— six of which append a fixed English sentence to `registrations.notes` that no admin endpoint
selected. The admin PATCH whitelist never accepted `needs_admin_review`, so "resolved" was not
representable and the Needs review filter could only grow. Two of the seven reasons ("payment
received AFTER this spot was cancelled") land only on cancelled rows, which the roster hides by
design, so those flags were invisible on every screen.

**What was built** (`src/lib/admin-review.ts`, `src/lib/admin-review-server.ts`,
`src/app/api/admin/registrations/[id]/review/route.ts`, `src/components/admin/ReviewSection.tsx`):

- **Why.** Every writer's sentence is recognised by its exact wording and reworded for the owner
  with a "what to do" — the SQL suites pin the literals on the writing side,
  `scripts/test-admin-review.ts` pins the reading side. The contact-collision writer now appends
  its own sentence too. A flag with no note (the ~24 legacy production rows) says "flagged before
  reasons were recorded" rather than inventing one.
- **What is wrong right now.** A live check recomputed from the rows — succeeded card payment vs.
  status, live offline receipts, the number of People records that still match, the cancelled-spot
  cases, the unconfirmed captain claim — shown on the row and in Player Detail, and run again
  server-side on every resolve. It is never read from notes.
- **Resolve.** `POST /api/admin/registrations/[id]/review` is the only path that sets the flag
  false. It answers 409 with the list while anything is still unsafe; the owner may resolve anyway
  only by acknowledging that and saying what they did (required text). The line written is
  `Review resolved <ISO> — <what>` or `Review resolved <ISO> despite: <what was still wrong> — <what>`,
  appended with a plain append (not `append_note_line`, whose substring dedupe would swallow a
  repeat). A compare-and-swap on `notes` and the flag refuses to clear if a writer got in between.
- **History.** Nothing is ever removed from notes; the contact-merge route, which used to replace
  notes on retired rows, now appends. Player Detail shows every resolution with its time, and the
  earlier reasons under "Review history". The Needs review filter, its URL and the overview are
  unchanged in mechanism — they still read the boolean — and the cancelled-spot flags now appear
  under that filter and on the overview via `RosterPayload.cancelledReviews`, never in `rows`.
- **Coverage.** `scripts/test-admin-review.ts` (121 checks): every writer's sentence, the live check
  per condition, resolving, history preserved, refusal and acknowledgement, flagged-again, the
  unflagged row untouched, the concurrent-writer refusal. `scripts/test-manual-payments-sql.ts`
  gained the previously untested cancelled-spot branch and the exact sentences (34 checks).
  `scripts/test-finalize-sql.ts` pins its sentences exactly (126). Exercised end to end against
  `hps-dev` through the running admin: legacy flag resolved, a real double payment refused → receipt
  voided → resolved, a cancelled spot with money surfaced and acknowledged.

**Why no migration, and the trade-off.** The proposal asked D to follow A's audit pattern, which is a
table. The audit found the existing columns can carry the workflow safely: the boolean is the filter,
notes is an append-only ledger with dated resolution lines, and safety is recomputed from the rows.
What a table would add is a queryable resolved-at and one row per occurrence. The cost of not having
it: when the same SQL-written cause recurs after a resolution, `append_note_line` finds the identical
earlier sentence and appends nothing — the flag goes up, notes gain no new line, and the admin reports
that honestly as "flagged again" with the live check as the explanation (the money rows carry their
own timestamps). For a one-owner site that cannot yet repair production's migration ledger, that is
the better trade; if reviews ever need reporting across events, the table is the next step and the
sentences already map 1:1 to codes.

## Explicitly not proposed

- **Automated or scheduled reminders** — see B.
- **A schema rewrite.** Track A avoids schema changes by design, and Stage 2.2 found nothing that
  demands one.
- **Production migration-ledger repair.** Still owed (22 rows for 44 files,
  STAGE-1-6-MIGRATION-RECONCILIATION.md §8), still separately authorised, and still not a
  prerequisite for any of the above.
- **Stripe sandbox, DocuSeal callback and Google OAuth coverage.** Real gaps, each needing its
  own isolated credentials; they are test-coverage work rather than Stage 2.3 features, and
  should be scoped separately so they are not quietly dropped.

## What I wanted before starting — all delivered

1. **The Stage 2.2 acceptance output** — 44/44 through the running admin, 2026-09-11
   (STAGE-2-2-REPORT.md §8).
2. **A decision on the payments invariant** in A — the *for card money* reading, settled by the
   owner (see the header).
3. **An order.** A, then C alongside it, then B, then D — which is the order they were built in.
