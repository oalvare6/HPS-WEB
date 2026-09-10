# Stage 1.4 — Stripe settlement validated against a real database, and the $80 repair made safe

**Date:** 2026-09-10. **Branch:** `claude/stripe-sandbox-validation-5l6kom`.
**Read after** `remediation_stage_1_2_report.md` and
[`SESSION-LOG-2026-09-09-RESUME-SMOKE-TEST.md`](SESSION-LOG-2026-09-09-RESUME-SMOKE-TEST.md).

> **Partly superseded 2026-09-10 by
> [`STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md`](STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md).**
> The pricing trap this document opens in §5 and leaves open in §7 is closed there: checkout
> no longer bills through a Stripe Price object, and the amount each session was authorised
> for is now recorded so a later fee edit cannot invalidate it. Everything else here stands.

Stage 1.2 shipped F-02: one settlement path, one transaction, `finalize_checkout_payment`.
Its own report ends with an asterisk (§8): *"the two SQL functions were reviewed by hand and
mirrored in `scripts/_test-fakes.ts`, but **not executed**"*, and §17 lists six assumptions
taken on trust. Every one of the 329 green assertions was green against an in-memory
imitation of the SQL.

Stage 1.4 removes the asterisk. The functions now run — on a real PostgreSQL, against a
production-shaped schema, driven by real Stripe-signed payloads — and the repair the owner
was told to run against production is fenced so it can only do the one thing it was meant to.

**Nothing was written to production.** Every production query in this session was a `SELECT`,
with one exception noted in §2 that wrote a temporary table inside a transaction that was
deliberately aborted.

---

## 1. Result

| | |
|---|---|
| SQL functions executed for the first time | **Yes.** 122 assertions, `scripts/test-finalize-sql.ts` |
| Whole chain executed (signed payload → handler → SQL → rows) | **Yes.** 78 assertions, `scripts/test-stripe-integration.ts` |
| The Next.js route itself executed | **Yes.** 10 assertions, `scripts/test-stripe-route.ts` — the first test in this repository to call a route export |
| §17.1 (the functions run) | **Verified**, on PostgreSQL 16.13 locally |
| §17.2 (`xmax = 0` distinguishes insert from update) | **Verified on production's own PostgreSQL 17.6.1** (§2) |
| Defects found | **Two in the settlement function**, both fixed and regression-tested (§4) |
| The $80 repair | **Rehearsed** against the exact production shape; converges, does not duplicate the payment (§5) |
| `--apply` safety | **Rebuilt.** It can no longer write anything the operator did not name (§6) |
| Live Stripe sandbox | **Not run** — no Stripe key of any kind exists in this environment. The seam is built and documented (§7) |

---

## 2. What the database actually says

Read-only, 2026-09-10, Supabase project `jqkiswwunrnyqjgroqtn` (PostgreSQL 17.6.1).

| Fact | Value |
|---|---|
| registration `803e3697-…` | still `pending`, `payment_method='card'`, not cancelled, not flagged, `notes` NULL |
| payment `bbd7fa9b-…` | `succeeded`, `80.00 usd`, `cs_live_…`, `pi_…`, linked to that registration and event |
| Community Cup `5bb92b95-…` | `entry_fee_cents = 8000`, `payments_open`, **`stripe_price_id` present** |
| `stripe_webhook_events` | **0 rows** |
| `payments` | 60 total; 4 linked to neither a registration nor a drop-in |
| pending/partial live registrations carrying a succeeded payment | **exactly 1** — the $80 row |
| registrations with two succeeded payments each | **2** (`44429dbb-…`, `0b37a2c9-…`) |
| `service_role` | `bypassrls`, no role settings |
| `authenticator` (the role PostgREST logs in as) | `statement_timeout=8s`, `lock_timeout=8s`, `session_preload_libraries=safeupdate` |

**`stripe_webhook_events` being empty means the F-02 settlement path has never run on real
money.** It is explainable — the newest payment predates the 2026-09-09 deploy — but until
Stage 1.4 the table could not tell "no payments yet" apart from "every delivery dies before
it reaches us". §4.3 changes that.

**The §17.2 assumption, settled on the real version.** `xmax = 0` after `ON CONFLICT` is the
one construct in the function whose behaviour is a PostgreSQL implementation detail, and the
local server is 16.13 while production is 17.6.1. It was checked on production directly, with
a probe that creates only an `ON COMMIT DROP` temp table and then raises, so the transaction
aborts and nothing persists:

```
PROBE server_version=17.6 insert_xmax_zero=t conflict_update_xmax_zero=f
```

Insert reports `true`, conflict-update reports `false`. The function's insert-vs-update
detection is correct on the version production runs.

---

## 3. What was built

| File | What it is |
|---|---|
| `scripts/sql/local-core-schema.sql` | The production core as a test fixture, derived from `docs/core_schema_snapshot.sql`: every column, CHECK, foreign key and unique index settlement touches, the `registrations_one_live_spot_idx` roster invariant, RLS with production's policy set, and the four Supabase roles **with their real per-role timeouts** |
| `scripts/_pg.ts` | Provisions a throwaway database and applies the fixture plus all three migrations verbatim. Drives `psql` — no Postgres driver is added to `package.json`, because the app does not talk to Postgres directly and a test-only dependency would be carried for ever |
| `scripts/_pg-finalize-store.ts` | A `FinalizeStore` over that database, mirroring `SupabaseFinalizeStore` statement for statement, calling the functions by **named parameter** the way PostgREST does |
| `scripts/test-finalize-sql.ts` | The SQL under test, alone. 122 assertions |
| `scripts/test-stripe-integration.ts` | Signed payload → `handleStripeWebhook` → the real SQL → real rows. 78 assertions |
| `scripts/test-stripe-route.ts` | The route export itself: raw-body fidelity, header, env wiring, route config. 10 assertions |
| `supabase/migrations/20260910120000_finalize_link_tolerance_and_lock_order.sql` | The two fixes in §4 |

### What these tests still do not prove

- **PostgREST is not psql.** The functions are called by named parameter, so a renamed
  argument fails exactly as production would, but the HTTP layer, PostgREST's JSON coercion
  and Supabase's connection pooling are not exercised.
- **The local server is 16.13, production is 17.6.1.** The one version-sensitive construct
  was checked on production directly (§2); nothing else in the function is version-specific.
- **No Stripe API call has ever been made from this repository's tests.** Signatures are
  generated and verified locally by the Stripe SDK. That proves our verification is correct;
  it proves nothing about delivery. See §7.
- **`/pay/success` and `/api/admin/sync-payments` are covered at the function they call**
  (`recordCheckoutSessionPayment`), not as routes.

---

## 4. Defects found by running the code

### 4.1 A cleaned-up link could throw away a payment — permanently

`finalize_checkout_payment` writes `registration_id`, `drop_in_id`, `contact_id` and
`tournament_id` into `payments`, which has a foreign key on all four. Two of those ids are
re-read from the database by the application first. **Two are not:**

```ts
contact_id    = metadata.contact_id ?? registration.contact_id ?? …
tournament_id = registration.tournament_id ?? drop_in.tournament_id ?? metadata.tournament_id
```

Stripe metadata is frozen at checkout. The admin deletes contacts — on
`/api/admin/contacts/[id]`, and on **every contact merge** (`/api/admin/contacts/merge`),
which is exactly what the 2026-08-17 data cleanup did — and it can delete tournaments. After
that, the id in an old session's metadata names a row that no longer exists and the insert
raises `23503`. The whole function is one transaction, so the payment goes down with it.

The consequences, in ascending order of cost:

- the webhook answers 500 so Stripe retries — and **every retry for three days fails
  identically**, because metadata never changes. The money is never recorded locally at all.
  That is strictly worse than the F-02 bug this system was built to fix, which at least
  recorded the payment.
- `/api/admin/sync-payments` walks the last 100 Checkout Sessions, so one merged contact can
  make the owner's "sync payments" button fail on a session from months ago.
- `scripts/reconcile-payments.ts` reprocesses up to 90 days of sessions — the repair tool can
  be stopped by the same row.

**Fix.** The money moved; recording it is not optional. A link that cannot be honoured is set
to null and written down. A missing registration, drop-in or event also withdraws
confirmation, so the row surfaces for the owner rather than reporting success. A merged-away
*contact* does not withdraw confirmation — it says nothing about whether the player paid.

### 4.2 Two payments for one registration deadlocked each other

The `payments` insert takes `FOR KEY SHARE` on the registration through the foreign key.
Step 4c then asked the same row for `FOR UPDATE` — a lock **upgrade**:

```
T1: insert payments (KEY SHARE on registration R) ─┐ compatible,
T2: insert payments (KEY SHARE on registration R) ─┘ both proceed
T1: select … R … for update  ────────────────────▶ waits for T2
T2: select … R … for update  ────────────────────▶ waits for T1   → 40P01
```

Reproduced on a real server: **1 of 12 concurrent pairs raised `deadlock detected`.** Postgres
kills one side, the function raises, the webhook answers 500 and Stripe retries — so no money
is lost — but it is a real 5xx on a payment path, and production already holds two
registrations carrying two succeeded payments each, which is the shape that races.

**Fix.** Lock order, not more locking: take `FOR UPDATE` on the registration (and the
drop-in, which has the same shape) *before* inserting the payment. Both transactions then
queue on the same lock in the same order. `scripts/test-finalize-sql.ts` runs 10 concurrent
pairs and requires zero deadlocks.

### 4.3 An empty ledger could not answer "does Stripe reach us at all?"

Unhandled event types returned 200 and wrote nothing, so `stripe_webhook_events` could not
distinguish "no payments yet" from "the endpoint is configured against a host that redirects
and every delivery dies at the edge". That second failure is not hypothetical here: CLAUDE.md
records a DocuSeal webhook that logged a month of successful 307s while **never once**
reaching this app.

**Fix.** Ignored events are now recorded with `outcome = 'ignored'`. Best effort — a write
failure is logged and still acknowledged, because nothing on that path needs to persist for
Stripe's sake. One row is now enough to prove reachability.

### 4.4 `append_note_line` was executable by PUBLIC

Its two siblings carry `REVOKE … FROM public, anon, authenticated; GRANT … TO service_role`;
it was created without one and kept PostgreSQL's default. It is immutable, takes and returns
text, and reads and writes nothing, so nothing was exposed — but "the settlement functions are
service_role-only" should be true as stated rather than true for two of three. Corrected in
the same migration, and asserted.

### 4.5 A documentation error that would have produced a wrong fixture

`docs/core_schema_snapshot.sql` renders `payments.amount`, `registrations.payment_amount` and
`tournaments.entry_fee` as bare `numeric`, with the precision only in a trailing comment.
Production has `numeric(10,2)`. A fixture copied from the snapshot literally rounds
differently from production and accepts amounts production would reject with `22003`. The
snapshot has been corrected and the fixture carries the real types; there is an assertion that
an amount overflowing `numeric(10,2)` raises rather than being silently stored.

---

## 5. The $80 record

`scripts/test-finalize-sql.ts` and `scripts/test-stripe-integration.ts` both reproduce the
production shape exactly — a `succeeded` `80.00` payments row created 2026-08-22T01:33:36Z,
linked to a registration still `pending` — and assert what a repair does to it:

| Assertion | Result |
|---|---|
| Reprocessing converges the registration to `paid` | yes |
| A second `payments` row is created | **no** — `payment_inserted = false` |
| The original payment id, amount and `created_at` survive | yes, untouched |
| The registration is flagged for review | no — it is a clean confirmation |
| Running the repair twice | second run changes nothing |
| Reaching it by Stripe dashboard replay instead | same result |
| Reaching it by the success page / admin sync | same result, reported as `already_recorded` |

**It will converge, not land in `needs_review`.** The Community Cup's `entry_fee_cents` is
8000 and the payment is 8000, so `validateBusinessFacts` passes. That is true *today*; see the
pricing trap below, which is the thing that would change the answer.

### The pricing trap that decides this

Checkout **bills** through the Stripe Price object when the event has a `stripe_price_id` —
and Community Cup does. Settlement **validates** against `tournaments.entry_fee_cents`.
Nothing in the app compares the two. While they agree, everything works. Edit the fee in the
admin without regenerating the Price, or the reverse, and every card payment for that event is
charged, recorded, and then **not confirmed** — the F-02 symptom, arriving through a different
door. `scripts/reconcile-payments.ts` now prints a pricing check on every run, and
`scripts/test-stripe-integration.ts` §5b pins the behaviour.

### Runbook

```bash
# 1. Look. Reads Stripe and the database; writes nothing.
npx tsx scripts/reconcile-payments.ts --json=/tmp/reconcile-before.json

# 2. Repair exactly one record, and nothing else.
HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply \
  --registration=803e3697-4476-41ea-bdaa-afec654bdf7c \
  --expect-writes=1 \
  --expect-kind=registration_pending_with_payment \
  --json=/tmp/reconcile-after.json

# 3. Confirm. payment_status should read 'paid'; the payment id must be unchanged.
```

The banner at the top of every run names the Stripe account (**LIVE** or test) and the
Supabase project before anything happens. If step 2 refuses, **read the refusal rather than
removing the guard** — it means the world is not what step 1 showed.

If it is easier, replaying the session's event from the Stripe dashboard reaches the same
place. One caveat found in testing: **a dashboard replay is a permanent no-op once that event
id has been processed**, because delivery idempotency answers `duplicate_event`. For this
record that is fine — `stripe_webhook_events` is empty, so its event has never been processed.

---

## 6. `--apply` is no longer a single keystroke over 90 days of money

The instruction on file (report §13 step 6) was
`HPS_RECONCILE_APPLY=1 npx tsx scripts/reconcile-payments.ts --apply`. That repaired **every**
`finalize` proposal in the window. For converging one known record it is far more than was
asked, and the owner is not technical.

`--apply` now refuses to start without an explicit scope:

| Flag | Effect |
|---|---|
| `--session=cs_…` / `--registration=<uuid>` | repeatable; only these may be written |
| `--all` | no scope — must be said out loud |
| `--max-writes=N` | refuse a bigger plan (**defaults to 1 when scoped**) |
| `--expect-writes=N` | refuse unless the plan is exactly N records |
| `--expect-kind=<kind>` | repeatable; refuse unless every repair is of these kinds |
| `--json=<path>` | write an audit record: banner, discrepancies, plan, before, results, after |

Analysis still examines the whole window and prints everything — the scope limits what may be
**written**, never what you get to see. A refused run exits 3 and writes nothing. Applying
prints the affected rows before and after, then states plainly whether the registration you
came to fix actually changed. The guards are enforced in `planRepairs`/`applyPlan` in
`src/lib/payment-reconcile.ts`, not in the script, so they are tested
(`scripts/test-reconcile-payments.ts`, now 29 assertions) and cannot be bypassed by a caller.

### Two corrections to `remediation_stage_1_2_report.md` §15

- **The other known records are outside the default window.** The 4 unlinked payments and both
  duplicate-payment pairs date from 2026-04 and 2026-05; a 90-day run started today does not
  see them. §15's expectation that they "will surface as `payment_unlinked` in the reconciler's
  dry run" is only true with `--since-days` widened past them.
- **`--apply` was never limited to the known row**, which §13 step 6 implies by context.

### The two duplicate-payment registrations

`44429dbb-…` and `0b37a2c9-…` each carry two succeeded payments. The reconciler classifies
this as `duplicate_local_payment` with proposal `flag_for_admin` and **never repairs it
automatically** — a possible double charge is a refund decision, which is the owner's. They
are out of the default window, so they will not appear until it is widened. Left alone
deliberately.

---

## 7. What a "Stripe sandbox validation" can and cannot be here

There is no Stripe API key in this repository or its environment — no `.env.local`, no
`STRIPE_*` variable. So:

**What was validated offline, and is real:** signature verification uses the Stripe SDK's own
`generateTestHeaderString` and `constructEvent`, the same call the route makes. The route
proves the signed bytes survive the `Request` intact — unicode, CRLF, tabs, backslashes and
quotes — and that the same JSON with keys reordered is rejected, which is what "verify the
bytes, not the meaning" means in practice.

**What that does not prove:** that Stripe's servers can reach this app. `constructEvent` does
no schema validation — it checks the HMAC and calls `JSON.parse` — so a hand-built fixture
that has drifted from Stripe's real object shape is invisible to it.

**The seam, for when a key is available.** `scripts/test-stripe-integration.ts --live-sandbox`
with `STRIPE_SECRET_KEY=sk_test_…` creates a genuine test-mode Checkout Session, retrieves it,
asserts that **every field the offline fixture relies on exists on the real object**, drives it
through the same settlement, and expires the session afterwards. It refuses to run against
anything that is not an `sk_test_` key. Until then the offline half runs and the output says
in one line that no real Stripe object was touched.

**One correction to the deployment plan.** Report §13 step 5 tells the operator to send a test
`checkout.session.completed` from the Stripe Dashboard at production and expect
`needs_review`. Two problems: the dashboard's synthetic payload matches no local record, and
if it carries a `customer_details.email` it will **insert a junk row into the production
payments ledger**. Prefer watching `stripe_webhook_events` for the first real payment. Since
§4.3, an ordinary ignored event also proves reachability without touching the ledger at all.

---

## 8. Known hazards recorded, not changed

- **The middleware runs on `/api/stripe/webhook`.** A delivery arriving on a non-canonical
  production host gets a 308, and senders do not follow redirects. The apex is already
  allow-listed (`src/lib/canonical-host.ts`), and Stripe is configured against `www`, so
  nothing is broken today — but a webhook pointed at a `.vercel.app` alias would die silently.
  Left as-is deliberately: CLAUDE.md is explicit that the canonical-host check must not be
  loosened, and the reachability evidence from §4.3 is the better answer.
- **`/pay/success` settles money on an unauthenticated GET** with a session id from the query
  string. Pre-existing, unchanged, and worth its own look.
- **`needs_admin_review` is never cleared by code.** Once flagged, a row stays flagged until
  the owner clears it. 24 registrations currently carry it.
- **A `confirm=false` drop-in flags nothing**, because there is no registration to flag. The
  reason is on the payment row.
- **An existing `payments` row's amount is never corrected.** If a row exists with the wrong
  amount, the upsert keeps it and still reports `finalized`. Deliberate — Stripe wrote the
  amount the first time too — but it means the ledger is not self-healing about amounts.
- **`registrations.email` is `text`, not `citext`** (unlike `contacts.email`), so the legacy
  email fallback in `findRegistrationByEmail` is case-sensitive.

---

## 9. Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | no warnings or errors |
| `npm run build` | clean, 45 static pages generated |

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
| test-stripe-webhook | 20/20 (was 18) |
| test-reconcile-payments | 29/29 (was 14) |
| test-resend-sender | 13/13 |
| **test-stripe-route** | **10/10 — new** |
| **test-finalize-sql** | **122/122 — new** |
| **test-stripe-integration** | **78/78 — new** |
| **Total** | **514** |

Two existing suites changed count because behaviour changed: `test-stripe-webhook` 18 → 20
(ignored events are recorded) and `test-reconcile-payments` 14 → 29 (the apply guards).
Nothing that previously passed was removed or weakened.

---

## 10. For the operator

1. **Apply one migration** by hand, as before —
   `supabase/migrations/20260910120000_finalize_link_tolerance_and_lock_order.sql`. It is a
   `CREATE OR REPLACE` of one function plus two grants; it alters no table and changes no row.
   Safe in either deploy order: old application code calling the new function simply gets the
   tolerance.
2. **Deploy this branch.**
3. **Converge the $80 record** with the runbook in §5.
4. **Watch `stripe_webhook_events`.** It should stop being empty. The first real card payment
   should appear with `outcome = 'finalized'`; any event at all appearing proves Stripe reaches
   the app.
5. **Read the pricing check** at the top of the next reconciler run. If it says `DRIFT` for an
   event, card payments for that event are being charged one amount and validated against
   another.
