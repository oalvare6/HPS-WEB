# Session log — 2026-08-14 (third session): confirm before you're on a roster

**Read [`docs/REBUILD-PLAN.md`](./REBUILD-PLAN.md) first, then this file.** It follows
[`docs/SESSION-LOG-2026-08-14-WAIVERS.md`](./SESSION-LOG-2026-08-14-WAIVERS.md), the waiver
round trip earlier the same day, and the `feat(pay,events)` commit that shipped cash-or-card
and open play as its own kind.

`main` @ **`7e9bb42`**, pushed. Community Cup starts **2026-08-21 — 7 days out.** Open Play:
Friday August 14th ran the night this session shipped.

---

## 1. The headline

Two operator reports, same evening, both about the same screen. Opening `/register` for an
event he was **already signed up for** showed nothing but "Pay $15 by card" / "I'll pay cash
at the field" — no way to see where he stood, no way out. And, separately: *"a lot of people
will click the register and not even pay or select payment so i dont want ppl to sign up if
they havent commited."*

Both trace to the same root: **the roster row was written before anyone committed to
anything.** `QuickJoinCard` wrote a `registrations` row on the *first* tap of either button —
card then bounced straight to Stripe, so a second thought at checkout left a permanent unpaid
row with no way off it. `/pay?tournament=<slug>` had an even quieter version: a signed-in
player with a valid waiver got enrolled just by **loading the page**, zero clicks.

While fixing this, a sweep for the one known duplicate (elmervillatoro on the Community Cup,
flagged at the end of the prior session) found **nine** people holding more than one live
registration on the same event, not one. Fixed the same session, same root cause family: two
front doors, same person, two rows.

---

## 2. Operator decisions locked this session

| # | Decision |
|---|---|
| D17 | **Nothing reaches a roster without an explicit Confirm.** Selecting a payment method is not committing; pressing Confirm is. Applies to the returning-player quick-join path and to page-load auto-enroll alike. |
| D18 | **A player may cancel their own spot unless card money actually moved.** Unpaid, cash-declared, and admin-marked-paid-for-cash all self-cancel. A succeeded Stripe charge does not — that needs a refund decision, which stays with the owner. |
| D19 | **One live registration per person per event, enforced in the database**, not just assumed. A duplicate must fail loudly (`23505`) and be explained to the player, never silently retried or silently allowed. |

---

## 3. Code shipped

### 3a. The confirm gate — `src/components/register/QuickJoinCard.tsx`

Rewritten from two one-tap buttons to select-then-confirm: radio for card/cash, **Confirm
disabled until one is picked**, caption *"You're not signed up until you press Confirm."*
Nothing is written to `registrations` before that click. Also drops the team picker entirely
when `eventKindCopy(event).hasTeams` is false — open play was rendering "Teams for this event
aren't set up yet" on a night whose own page promises "sides made on the night."

`POST /api/register/join` now accepts `paymentMethod` and writes it **in the same insert**.
Previously the client fired a second request to `/api/register/payment-intent` and swallowed
its failure — a cash player could land on the roster with `payment_method` NULL and the owner
would never know to expect cash from them.

### 3b. Closed the page-load auto-enroll — `src/lib/pay-eligibility.ts`

`runPayEligibilityCheck` now takes a **required** `allowAutoEnroll: boolean` — no default, so
a future caller has to decide rather than inherit the old behaviour. Both current callers
(`/pay/page.tsx` server path, `/api/pay/eligibility`) pass `false`. The `needs_registration`
branch that used to enroll automatically is kept, gated on the flag, rather than deleted —
merely typing an email into a gate should never write a roster row.

### 3c. Self-cancel — new `registrations.cancelled_at`

`supabase/migrations/20260814234500_add_registrations_cancelled_at.sql` — additive nullable
timestamptz, applied before the code. NULL means live; nothing is ever deleted on cancel, so
the row and its waiver linkage survive.

`src/lib/registration-cancel.ts` is the pure rule, mirroring how `signup-state.ts` and
`payment-method.ts` are built — tested without a database
(`scripts/test-cancel-eligibility.ts`, 11/11). The load-bearing detail: the discriminator is
a **succeeded row in `payments`**, never `registrations.payment_status`. That column is set by
two different things — the Stripe webhook, and the owner tapping the paid toggle after someone
hands over cash at the field — so reading it would refuse exactly the cash players this was
built to let out.

`CardPaymentLookup` is a tri-state (`none` / `found` / `failed`), not a boolean, so "we don't
know whether money moved" is a value the rule can see and refuse on. A wrongly-allowed cancel
leaves someone who paid believing they're out; that direction of error is the one to avoid.

`POST /api/registrations/[id]/cancel` authorizes by session **or** the same HMAC pay-resume
token `/api/waiver/sign` and `payment-intent` already use — no second scheme. Sign-in is not
required to register (§A8), so most players reach their spot through a texted link, not a
session.

Eight `registrations` reads across the codebase now filter `cancelled_at is null` where "does
this person hold a live spot" is the actual question — `findEventRegistration`,
`findRegistrationForPayGate` (both lookups), the `/api/register/join` existing-row check, the
admin roster and stats routes, `/pay`'s `loadResumeSummary`, `payment-intent`, and the Stripe
checkout gate. Deliberately **not** filtered: contacts merge/export, `sync-waivers`, the
DocuSeal webhook, waiver capture/reconcile, and the admin registrations list — those need to
see history, not just live state.

`CancelSpotButton` renders on `OwesPaymentCard`, `AlreadyPaidCard`, and `/pay`'s
`PayLaterCard`. The `/pay` instance sits inside `PayForm`'s Suspense subtree, so — same
constraint as `PaymentChoice` — it is a client component with **no async children**.
Re-verified on a production build (`next start`, not `next dev`) that the Pay button still
renders.

### 3d. The duplicate sweep — `supabase/migrations/20260815001500_dedupe_registrations_and_guard.sql`

The one duplicate flagged at the end of the waivers session (elmervillatoro, two Community Cup
rows seven minutes apart) turned out to be one of **nine**. Eight more were on the finished
World Cup, one contact with three rows. Every group had the same fingerprint: an early
`pending` row with no team and no payment, then a later `paid` row with a team and a Stripe
receipt — the two-front-doors bug's signature, predating this session's fix.

Retired 10 rows (never deleted — no database backups exist) using a rule that leads with
**money, not recency**: settled status first, then a succeeded Stripe payment, then a team,
then earliest `created_at`. "Keep the newest" would have been wrong on its own — in most
groups the stray *is* the first attempt, and `mplorenz@gmail.com`'s two rows are identical and
23 seconds apart, decided only by the last tiebreak. Verified after applying: **0 of the 10
retired rows were settled, 0 had a Stripe payment.** 105 → 95 live rows.

Then `registrations_one_live_spot_idx` — partial UNIQUE on
`(tournament_id, contact_id) where cancelled_at is null and contact_id is not null` — makes it
impossible to recreate. Partial on `cancelled_at` so a cancel stays reversible; partial on
`contact_id` because 37 legacy rows have none and a NULL there means "unknown," not "the same
person." Verified firing against production inside a rollback block, no row left behind.

`enrollContactInTournament` now returns a distinct `already_registered` reason on `23505`
(Postgres unique-violation), and `/api/register/join` / `/api/register` both answer **409**
with "you're already signed up" rather than a generic 500 — "please try again" would be a lie
when the insert can never succeed.

### 3e. The `/me` consequence — `collapseSupersededRows`

Eight of the ten retired rows belong to people who **actually played the World Cup**. Left
alone, `/me` would badge that registration "cancelled" in their own history — the site telling
them something untrue about a tournament they turned up to. `src/app/me/page.tsx` now hides a
cancelled row when the same event still has a live one, keyed on "is there a live sibling for
this `tournament_id`," not on a string in `notes`. A genuine cancel with no replacement still
shows as cancelled, correctly.

---

## 4. Verified, not assumed

```
POST /api/registrations/[id]/cancel   bad token → 403
                                       real token → 200 {"ok":true,"alreadyCancelled":false}
                                       repeat     → 200 {"ok":true,"alreadyCancelled":true}
POST /api/register/payment-intent     cancelled spot → 409
POST /api/stripe/checkout             cancelled spot → 409
```

Run against the live open-play registration for tonight's event — headcount 2 → 1 → **restored
to 2** afterward, nothing left dangling.

Duplicate guard, run against production inside a transaction that rolled back:

```
insert duplicate row for the live Community Cup registration
  → unique_violation, sqlstate 23505, guard fired
  → community_cup_live_rows_still = 4   (unchanged)
```

Dedupe outcome:

```
live_duplicate_groups        0
retired                      10
retired_settled              0   (must be 0 — was)
retired_with_stripe_payment  0   (must be 0 — was)
guard index present          1
live rows, before → after    105 → 95
```

Local gates: `tsc` clean, production build clean, **113/113** across seven scripts —
`test-tournament-state` 16, `test-signup-state` 18 (+2 for the cancel contract: a cancelled
row must resolve to `quick_join`/`full_signup`, never `owes_payment`), `test-roster-totals`
12, `test-canonical-host` 15, `test-waiver-reconcile` 16, `test-event-cta` 25 (+3, matching
the state tests), `test-cancel-eligibility` 11 (new).

`/pay`'s Suspense constraint re-checked with the new `CancelSpotButton` in place: Pay button,
cash option, and cancel link all rendered on a clean `next start` build.

---

## 5. Still open — ordered

1. **The confirm gate's click path is verified only by static render.** All three variants
   (open play / tournament / no-fee event) were rendered with `renderToStaticMarkup` and
   assert the right radio count and a disabled Confirm button — but actually pressing Confirm
   needs a signed-in Google session, which no automated check in this environment can hold.
   Same limitation every prior session recorded for the admin screens.
2. **Tranche 2, not built this session, agreed with the operator:** D7's "Cup players play
   open play free" (free when their tournament row is paid, waived, **or** cash-declared —
   not merely signed up with nothing said), and a richer `/me` enrollment view (event date,
   what's owed, a Manage link, `CancelSpotButton` per row). ⚠ Whoever builds the free rule: it
   necessarily reads `kind` to decide money, which every other part of this codebase forbids
   (`lib/event-kind.ts`). Defensible only if it **fails toward charging** — default to the
   event's own fee, waive only on a positively-confirmed active-roster hold, treat any lookup
   error as "not free." Record the exception at the point the invariant is stated.
3. **`APP_SIGNING_SECRET` is still unset**; the app runs on the legacy `ADMIN_SESSION_SECRET`
   alias and logs a deprecation warning on every token mint. Harmless, one rename away from
   tidy.
4. Everything carried from the waivers session that's still true: 97 registrations signed
   with no retrievable document (sync only ever swept `sent`, not historical `signed` rows),
   no real end-to-end DocuSeal signature has travelled the fixed webhook path yet, no database
   backups, exposed credentials still valid at source, waiver text and legal pages unreviewed.
5. **The open play slug is still `open-play-july-27-28-2026`** for an event titled "Friday
   August 14th." Unchanged deliberately — fixing it breaks links already texted out.

---

## 6. Traps for whoever picks this up

- **Never infer withdrawal from `payment_status`.** `'waived'` and `'refunded'` are statements
  about money and are read as *settled* by `resolveSignupState`, the roster totals, and the
  pay gate. Cancellation lives only in `registrations.cancelled_at`.
- **Never read `registrations.payment_status` to decide whether a cancel is safe.** It is set
  by both the Stripe webhook and the owner's cash toggle — ask `payments` for a succeeded row
  instead. §3c.
- **`23505` on a `registrations` insert is not a generic failure — it is `already_registered`.**
  Report it as such; "please try again" sends a player at an insert that can now never
  succeed. §3d.
- **`allowAutoEnroll` has no default on purpose.** A new caller of
  `runPayEligibilityCheck` must decide, not inherit page-load auto-enroll back in. §3b.
- **`CancelSpotButton`, like `PaymentChoice`, must stay a client component with no async
  children** wherever it renders inside `PayForm`'s Suspense subtree on `/pay`. §3c, and see
  `EnrolledPanels.tsx`.
- **`/me` must keep collapsing cancelled rows with a live sibling.** Removing
  `collapseSupersededRows` would re-badge eight real World Cup registrations "cancelled." §3e.
- Everything in [`docs/SESSION-LOG-2026-08-14-WAIVERS.md`](./SESSION-LOG-2026-08-14-WAIVERS.md)
  §8 still applies — the Suspense boundary rule, the apex-domain webhook trap, don't revert
  `7d64d8a`, verify against a production build.

---

## 7. Files worth knowing about (new this session)

| Path | What |
|---|---|
| `src/lib/registration-cancel.ts` | Pure cancel-eligibility rule. Tri-state payment lookup. |
| `src/app/api/registrations/[id]/cancel/route.ts` | The only way off a roster. Session or pay-resume token. |
| `src/components/register/CancelSpotButton.tsx` | Renders in three places; no async children. |
| `supabase/migrations/20260814234500_add_registrations_cancelled_at.sql` | Additive column. |
| `supabase/migrations/20260815001500_dedupe_registrations_and_guard.sql` | Retires 10 rows, then guards. Idempotent. |
| `scripts/test-cancel-eligibility.ts` | 11 cases over the cancel rule. |
