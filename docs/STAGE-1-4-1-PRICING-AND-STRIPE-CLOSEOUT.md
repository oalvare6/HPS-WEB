# Stage 1.4.1 — Supabase is the price, and the quote is honoured

**Date:** 2026-09-10. **Branch:** `claude/stage-1-4-1-pricing-closeout`.
**Read after** [`STAGE-1-4-STRIPE-VALIDATION.md`](STAGE-1-4-STRIPE-VALIDATION.md), whose §5
pricing trap and §7 open item this closes.

Stage 1.4 executed the settlement SQL and found, among other things, that HPS could charge a
customer successfully and then refuse to confirm their registration — because two different
things decided the price and nothing kept them in step. This stage removes the second one.

**Nothing was deployed, no production row was changed, and no production Stripe secret was
used or requested.** The only production access was read-only `SELECT`s.

---

## 1. The old architecture

```
tournaments.entry_fee_cents ─┐
                             ├─► priceTournamentCheckout() ─► ResolvedCheckout
tournaments.stripe_price_id ─┘                                   │
                                                                 ├─ amountCents
                                                                 └─ stripePriceId
                                                                       │
   createStripeCheckoutSession:                                        │
       line_items = stripePriceId ? [{ price: stripePriceId }]  ◄───────┘
                                  : [{ price_data: { unit_amount: amountCents } }]
                                        │
                                        ▼
                              Stripe charges the customer
                                        │
                                        ▼
   webhook → finalizeCheckoutSession → validateBusinessFacts
                                        │
                       expected = priceTournamentCheckout(...).amountCents
                                = entry_fee_cents      ← NOT what was charged
```

Community Cup carried a `stripe_price_id` in production, so this was the live path for real
card payments, not a theoretical branch.

## 2. Root cause of the drift

**Two price sources with no relationship between them.** `tournaments.entry_fee_cents` is
edited in the admin. `tournaments.stripe_price_id` points at a Stripe Price object created by
`syncTournamentStripePricing`, which runs on event save and mints a *new* Price whenever the
fee changes. Nothing enforced that the Price a session billed through was the Price generated
from the current fee — and nothing compared them at settlement, because settlement only ever
looked at `entry_fee_cents`.

The failure is quiet and it costs money twice: the customer is charged, so the money moves;
and the registration stays `pending`, so the roster says they still owe. The owner then asks a
player who has already paid to pay again.

There is a second, subtler version of the same bug that survives even with one price source:
the fee can change **between** a session being created and being paid.

```
10:00  session created, customer quoted $80
10:05  owner edits the event fee to $90
10:07  customer completes the $80 session they were quoted
       settlement expects 9000, sees 8000 → refuses to confirm
```

The customer paid exactly what was asked of them. Refusing that is not financial correctness.

## 3. The new source of truth

**`tournaments.entry_fee_cents` and `drop_ins.amount_cents` are authoritative.** Stripe Price
objects do not define HPS pricing.

Enforced structurally rather than by convention:

- `ResolvedCheckout` **no longer has a price-id field**. There is nowhere for a second price to
  live between pricing and charging.
- `PricedTournament` no longer carries `stripe_price_id`, and the two `SELECT`s that fed it
  no longer fetch the column.
- `createStripeCheckoutSession` has **no branch**: every session is `price_data` with
  `unit_amount: resolved.amountCents`.

`tournaments.stripe_price_id` and `stripe_product_id` are still written by
`syncTournamentStripePricing` on event save, and are now read by nothing. See §17.

## 4. Checkout pricing flow

```
event row (entry_fee_cents / drop_in_fee_cents)        drop_ins.amount_cents
        │                                                      │
        │   validated client choices                           │
        │   (pay_kind, roster_size 8–12, team_name)            │
        ▼                                                      ▼
   priceTournamentCheckout()  ───────────►  ResolvedCheckout.amountCents  ◄── resolveDropInCheckout()
        │                                            │
        │                                            ▼
        │                            line_items[0].price_data.unit_amount
        │                                            │
        │                                            ▼
        │                                    Stripe charges exactly that
        │                                            │
        └────────────────────────────────────────────┴──► stripe_checkout_attempts
                                                           (session id, amount, links)
```

The only client-supplied inputs that reach a price are `pay_kind`, `roster_size` and
`team_name`. Each is parsed server-side (`parseCheckoutPayKind`, `parseWorldCupRosterSize`)
and selects among **server-defined** options; none of them *is* an amount. There is no request
field anywhere that carries money, and `createStripeCheckoutSession` has no parameter that
could accept one.

Pricing rules preserved exactly as they already existed — no discounts, deposits or overrides
exist in this system, so none were invented:

| Case | Amount |
|---|---|
| Event entry | `entry_fee_cents` |
| Event with no entry fee (open play) | falls back to `drop_in_fee_cents` |
| Explicit drop-in on an event | `drop_in_fee_cents` |
| A `drop_ins` row (admin pay link) | that row's `amount_cents` |
| World Cup, full team | flat `WORLD_CUP_TEAM_FEE_CENTS` (96000) |
| World Cup, share | `round(96000 / rosterSize)`, roster 8–12 |
| No fee configured | refuses — never charges zero |

## 5. Settlement validation flow

```
verified Stripe session
        │
        ├─ load registration / drop-in / tournament (re-read, never trusted from metadata)
        ├─ load stripe_checkout_attempts[session_id]
        ▼
validateBusinessFacts:
   currency must be usd                                    ──► else needs_review
   an authorisation row exists?
        YES → it must be for THIS registration / drop-in / event  ──► else needs_review
              amount_total must equal the authorised amount       ──► else needs_review
              confirm  (source = "authorized")
        NO  → amount_total must equal priceTournamentCheckout(...) today
              confirm  (source = "derived")
```

`priceTournamentCheckout` is still the only thing that computes a price. The attempt row is
not a second price source: nothing derives an amount from it; it records a decision that
function already made, so the decision can be honoured later.

## 6. Price edits after a session is created

| Situation | Outcome |
|---|---|
| Fee unchanged | confirmed; nothing to say |
| Fee edited, session has an authorisation row | **confirmed at the authorised amount**, plus a note: *"Paid $80.00 — the price quoted when checkout started. This event now charges $90.00."* |
| Fee edited, session predates the table (legacy) | `needs_review`, as before — with nothing recorded there is no honest way to know what the customer was quoted |
| Amount paid ≠ amount authorised | `needs_review`; the reason names the authorised figure |
| Authorisation belongs to another registration / drop-in / event | `needs_review` (`authorization_mismatch`) |

The note is a note, not a review flag: the payment is correct and the owner should not have to
clear a queue item for it, but a roster showing "$80 paid" on a $90 event should explain
itself. It goes through the existing `notes_line` argument, so `append_note_line` dedupes it
and re-settling never repeats it.

**Why not put the authorised amount in Stripe metadata?** It would be simpler and it is
signature-verified — but the F-02 trust model is explicit that metadata *identifies* and never
*authorises*, so that a session created by some other code path cannot dictate what we accept.
An amount in metadata inverts that. A server-side row keeps "re-derive from rows we wrote"
true; it is just a different row.

**If the attempt write fails**, the player must still be able to pay. It is best effort: the
failure is logged, checkout proceeds, and settlement falls back to deriving — exactly what it
did before the table existed.

## 7. Files changed

| File | Change |
|---|---|
| `src/lib/stripe-checkout.ts` | `price_data` always; `stripePriceId` removed from `ResolvedCheckout`; `stripe_price_id` removed from `PricedTournament` and its select; `recordCheckoutAttempt()` added and called on every session; injectable `createSession` / `recordAttempt` seams for tests |
| `src/lib/payment-finalize.ts` | `CheckoutAttemptRow`; `loadCheckoutAttempt` on `FinalizeStore`; `validateBusinessFacts` prefers the authorised amount and reports its `source`; `settlementNotesLine()` extracted |
| `src/lib/payment-finalize-store-supabase.ts` | reads `stripe_checkout_attempts`; tolerates the table being absent (deploy ordering) by falling back; no longer selects `stripe_price_id` |
| `src/app/api/admin/drop-ins/[id]/pay-link/route.ts` | records its authorised amount — it creates its own session and does not go through `createStripeCheckoutSession` |
| `scripts/reconcile-payments.ts` | the pricing check is now housekeeping, not an alarm: a stale Price can no longer charge anyone |
| `scripts/_pg.ts`, `scripts/_pg-finalize-store.ts`, `scripts/_test-fakes.ts` | the new migration and the new store method |
| `CLAUDE.md`, `docs/STAGE-1-4-STRIPE-VALIDATION.md` | the pricing rule rewritten as closed; supersession note |

## 8. Migrations created

One, additive: **`supabase/migrations/20260910130000_stripe_checkout_attempts.sql`**.

Creates `stripe_checkout_attempts` (`stripe_session_id` PK, `amount_cents`, `currency`, links
to registration / drop-in / tournament all `ON DELETE SET NULL`, `pay_kind`, `roster_size`,
`created_at`), two indexes, RLS enabled with no policies, `REVOKE` from anon/authenticated.
No existing object is altered.

Safe in either deploy order: old code never reads it, and new code treats a missing row — or a
missing table — as "fall back to deriving".

## 9. Tests added

`scripts/test-checkout-pricing.ts` (**new, 65 assertions**) — the amount comes from the event
row and only from there; `ResolvedCheckout` has no price-id field; a `stripe_price_id` still
present on a row cannot change the amount; the exact parameters handed to Stripe carry
`price_data.unit_amount` equal to the computed amount and no `price`; no amount-shaped key
appears in metadata; amount-shaped keys smuggled onto the input are ignored; roster sizes
outside 8–12 (and `"12; drop table"`, `"8.5"`, `1e3`, `{}`, `[]`, `null`) are refused while
8–12 price server-side; checkout and settlement agree for entry, drop-in, full-team and share;
a cent either way is refused; an authorisation beats today's price but only its own; a
wrong-owner, wrong-event, wrong-currency or under-paid authorisation is refused; legacy
sessions still derive.

`scripts/test-stripe-integration.ts` (+12) — against the real database: a legacy session paid
at the old price → `needs_review`; a session with an authorisation row → confirmed with the
plain-language note, and re-settling does not repeat it; paying less than authorised →
`needs_review` naming the authorised figure; another registration's authorisation cannot be
borrowed; a drop-in settles at the amount its link was created for after the fee was edited.

`scripts/test-reconcile-payments.ts` (+6) — the repaired payment keeps its id, amount and
Stripe identifiers; no second row appears; a second scoped dry run proposes nothing and
applying it changes nothing.

## 10. Test totals

| Suite | |
|---|---|
| test-tournament-state | 16/16 |
| test-signup-state | 18/18 |
| test-roster-totals | 12/12 |
| test-canonical-host | 15/15 |
| test-open-play-free-entry | 29/29 |
| test-standings | 15/15 |
| test-schedule | 14/14 |
| test-resume-access | 41/41 |
| test-resume-routes | 46/46 |
| test-payment-finalize | 36/36 |
| test-stripe-webhook | 20/20 |
| test-reconcile-payments | 35/35 (was 29) |
| test-resend-sender | 13/13 |
| test-stripe-route | 10/10 |
| **test-checkout-pricing** | **65/65 — new** |
| test-finalize-sql | 122/122 |
| test-stripe-integration | 90/90 (was 78) |
| **Total** | **597** |

`npx tsc --noEmit` clean · `npm run lint` clean · `npm run build` clean.

## 11. Stripe sandbox test status

| # | Case | Status |
|---|---|---|
| 1 | Successful Checkout Session | **Covered offline.** `test-checkout-pricing.ts` asserts the exact create parameters. A real test-mode session is created only by `--live-sandbox`. **Awaiting operator** |
| 2 | Real signed webhook delivery | **Signature verification covered** (`test-stripe-route.ts`, real SDK signatures through the real route). **A delivery from Stripe's servers is awaiting operator** |
| 3 | Duplicate delivery | **Covered** — `test-stripe-integration.ts`, real DB: second delivery → `duplicate_event`, one payment row |
| 4 | Replay | **Covered** — replaying after an admin undo changes nothing |
| 5 | Amount mismatch | **Covered** — derived and authorised paths both |
| 6 | Currency mismatch | **Covered** |
| 7 | Database failure → non-2xx | **Covered** — 500, nothing written, event not marked processed |
| 8 | Retry converging later | **Covered** — the retry settles |
| 9 | Async success / failure | **Covered** — `async_payment_succeeded` settles, `async_payment_failed` recorded |

**No Stripe API key of any kind exists in this environment** (no `.env.local`, no `STRIPE_*`
variable), so no real Stripe object has been created. Outbound access to
`houstonpremiersoccer.com` is also blocked by this environment's proxy, so the deployed
endpoint could not be probed from here either.

## 12. Remaining manual sandbox procedure

Run from a trusted machine with a **test-mode** key. Never a live key.

```bash
# 0. Prerequisites: Stripe CLI, and a sk_test_ key from the Stripe dashboard
#    (Developers → API keys, TEST MODE toggle on).
stripe --version
export STRIPE_SECRET_KEY=sk_test_…

# 1. Offline half — proves the fixtures match a real test-mode object, then
#    drives a genuine test-mode session through settlement. Creates and expires
#    one test session; touches no live data.
npx tsx scripts/test-stripe-integration.ts --live-sandbox

# 2. Point Stripe at a local app and take a real delivery.
npm run dev                                  # terminal 1
stripe listen --forward-to localhost:3000/api/stripe/webhook   # terminal 2
#    `stripe listen` prints a whsec_… — put it in .env.local as
#    STRIPE_WEBHOOK_SECRET and restart `npm run dev`.

# 3. Drive each case (terminal 3).
stripe trigger checkout.session.completed              # 1, 2
stripe events resend <evt_id>                          # 3, 4 — expect duplicate_event
stripe trigger checkout.session.async_payment_succeeded # 9
stripe trigger checkout.session.async_payment_failed    # 9

# 4. Amount and currency mismatch: pay a real test session, then edit the
#    event's entry_fee_cents in the admin BEFORE the webhook is replayed, and
#    resend. With an attempt row it must settle; delete the attempt row first to
#    see the legacy path refuse it.

# 5. Database failure → non-2xx: stop Supabase (or revoke the service key) and
#    resend an event. Expect 500 in `stripe listen`, and Stripe retrying.
#    Restore, resend, expect it to settle.

# 6. Confirm each result in the database:
select id, type, outcome, processed_at from public.stripe_webhook_events order by received_at desc limit 20;
```

**Then verify the sender, not the endpoint** — the lesson CLAUDE.md records from DocuSeal:

1. Stripe dashboard → Developers → Webhooks → confirm the endpoint URL is
   `https://www.houstonpremiersoccer.com/api/stripe/webhook` (**`www`**, not the apex — Vercel
   307s the apex at the edge and Stripe does not follow redirects).
2. Confirm it is subscribed to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
3. Read the endpoint's **delivery log**, not ours. Green there plus an empty
   `stripe_webhook_events` here means the deliveries are not arriving.
4. Since Stage 1.4 even an ignored event type writes a row, so **any** row in
   `stripe_webhook_events` proves Stripe reaches the app.

**Do not** use the dashboard's "Send test webhook" against production: its synthetic payload
matches no local record and, if it carries a `customer_details.email`, inserts a junk row into
the production payments ledger.

## 13. $80 orphan dry-run result

Production re-checked read-only, 2026-09-10 (this session):

| | |
|---|---|
| registration `803e3697-…` | `pending`, not cancelled, not flagged, `notes` NULL |
| payment `bbd7fa9b-…` | `succeeded`, `80.00 usd`, `cs_live_…`, created 2026-08-22T01:33:36Z |
| Community Cup `entry_fee_cents` | **8000** — equal to the payment |
| `stripe_checkout_attempts` | **does not exist in production** (this migration is unapplied) |
| `stripe_webhook_events` | still 0 rows |

So the record takes the **legacy/derived** path: no authorisation row, expected = 8000 =
paid → it converges cleanly rather than landing in `needs_review`. Verified against a real
PostgreSQL reproducing the exact shape:

- the divergence is detected as `registration_pending_with_payment`, proposal `finalize`;
- a plan scoped to that registration contains **exactly one** write, and the other repairable
  session in the window is reported as out of scope rather than silently dropped;
- applying it flips the registration to `paid`;
- **no second payment row** appears — `payment_inserted = false`;
- the payment's id, amount, `created_at` and Stripe identifiers are untouched;
- a second scoped dry run proposes nothing, and applying that changes nothing.

**Not executed against production.** No production row was modified.

## 14. The exact safe reconciliation command

```bash
# Look first. Reads Stripe and the database; writes nothing.
npx tsx scripts/reconcile-payments.ts --json=/tmp/reconcile-before.json

# Then repair exactly one record.
HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply \
  --registration=803e3697-4476-41ea-bdaa-afec654bdf7c \
  --expect-writes=1 \
  --expect-kind=registration_pending_with_payment \
  --json=/tmp/reconcile-after.json
```

No `--all`. The banner names the Stripe account (LIVE or test) and the Supabase project before
anything happens; the run prints the affected rows before and after and states plainly whether
`payment_status` changed. If it refuses, **read the refusal** — it means production is not in
the state the dry run showed. Do not remove a guard to get past it.

## 15. Deployment prerequisites

1. Apply **`20260910130000_stripe_checkout_attempts.sql`** by hand (SQL editor or MCP
   `apply_migration`), not `db push` — the migration ledger is still drifted.
   Verify: `select to_regclass('public.stripe_checkout_attempts');` → not null.
2. Stage 1.4's **`20260910120000_finalize_link_tolerance_and_lock_order.sql`** must also be
   applied if it has not been; it is unrelated to pricing but ships on the same lineage.
3. Deploy the branch. Either order is safe: without the table, settlement falls back to
   deriving; with the table but old code, nothing reads it.
4. Nothing else changes — no new environment variable, no Stripe dashboard change.

## 16. Rollback plan

- **Application:** revert the deploy. Checkout returns to the Price-object branch and
  settlement to deriving. Keep the table; the rows are the record of what customers were
  quoted.
- **Migration:** `drop table public.stripe_checkout_attempts;` if it must go. Settlement then
  derives for every session, which is the pre-Stage-1.4.1 behaviour. Nothing else depends on
  it.
- **Partial:** code without the table → every session derives (a warning is logged once per
  settlement); table without the code → the table fills with rows nothing reads. Neither
  corrupts anything.

## 17. Deferred, deliberately

- **Refunds and disputes.** `charge.refunded` / `charge.dispute.*` are still unhandled and
  `payment_status = 'refunded'` is still admin-only. Out of scope by instruction.
- **Schema cleanup:** `tournaments.stripe_price_id` and `tournaments.stripe_product_id` are
  now written and never read. Dropping them means also removing
  `syncTournamentStripePricing` and its two call sites in the admin tournament routes, and
  archiving the Price objects in Stripe. Left in place for history and for the dashboard.
- **`syncTournamentStripePricing` still runs on every event save**, creating a new Stripe
  Price whenever a fee changes. Harmless now, but it is API traffic for objects nothing uses.
- **Migration-ledger drift** — untouched, per instruction.
- **The reconciler's 90-day window** still hides the 4 unlinked payments and both
  duplicate-payment pairs (2026-04/05). Widen `--since-days` deliberately when the owner wants
  to look at them.
- **`/pay/success` settles money on an unauthenticated GET** with a session id from the query
  string. Pre-existing, unchanged.
- **`needs_admin_review` is never cleared by code**; 24 registrations carry it.
- **The middleware runs on `/api/stripe/webhook`.** The apex is allow-listed and Stripe is
  configured against `www`, so nothing is broken — but a webhook pointed at a `.vercel.app`
  alias would 308 and die silently.
- **No real Stripe test-mode delivery has yet reached the deployed webhook.** §12 is the
  procedure; it needs an operator with a `sk_test_` key.
