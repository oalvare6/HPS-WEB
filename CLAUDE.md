# Claude — read this first

**Active plan: [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md). Read it end to end before
touching code.**

It contains the operator's locked decisions, the production evidence behind them, the target
data model, and the order of work. It supersedes `docs/HANDOFF-PLAYER-PAY-FLOW.md` and the
phase lists in `.cursor/rules/hps-phases.mdc`.

**The one-line version:** the system is built around email and money; it needs to be built
around a person and a roster.

**Deadline in flight:** Community Cup starts 2026-08-21. Track A in the plan is the minimum to
run it properly and deliberately avoids schema changes. Track B is the deeper cleanup.

**Who this is for:** the admin is being handed to the company owner, who is not technical.
Simplicity for that person outranks cleverness everywhere.

## Reference

**Stack:** Next.js 15 App Router, React 19, Supabase, Stripe, DocuSeal. Player auth =
Supabase; admin = HMAC cookie.

**Local dev:** `npm run dev` → http://localhost:3000 (needs `.env.local`, including
`SUPABASE_SERVICE_ROLE_KEY` — most pages fail without it).

**Before claiming anything works:**

```bash
npx tsc --noEmit
npx tsx scripts/test-tournament-state.ts
npx tsx scripts/test-signup-state.ts
npx tsx scripts/test-roster-totals.ts
npx tsx scripts/test-canonical-host.ts
npx tsx scripts/test-open-play-free-entry.ts
npx tsx scripts/test-standings.ts
npx tsx scripts/test-schedule.ts
npx tsx scripts/test-resume-access.ts
npx tsx scripts/test-resume-routes.ts
npx tsx scripts/test-payment-finalize.ts
npx tsx scripts/test-stripe-webhook.ts
npx tsx scripts/test-reconcile-payments.ts
npx tsx scripts/test-resend-sender.ts
npx tsx scripts/test-stripe-route.ts
npx tsx scripts/test-checkout-pricing.ts
npx tsx scripts/test-event-state.ts
npx tsx scripts/test-event-cta.ts
npx tsx scripts/test-me-next-steps.ts
npx tsx scripts/test-cancel-eligibility.ts
npx tsx scripts/test-waiver-reconcile.ts
npx tsx scripts/test-finalize-sql.ts          # needs a PostgreSQL; see below
npx tsx scripts/test-stripe-integration.ts    # needs a PostgreSQL; see below
npx tsx scripts/test-migrations-from-empty.ts # needs a PostgreSQL; see below
npm run build
node scripts/verify-event-state-pages.mjs --build   # renders /, /events, /register, /events/[slug] in headless Chromium against a fixture stub (~1 min)
```

The last three **execute real SQL against a real PostgreSQL** — the settlement functions,
and (Stage 1.6) every file in `supabase/migrations/` from an empty database. They provision
a throwaway database: they use `HPS_TEST_DATABASE_URL` if it is set, otherwise a server on
port 54329, otherwise they start their own cluster with `initdb`. If none of that is possible
they **fail rather than skip** — a silent skip is how a suite stops proving what its name
says. `HPS_SKIP_PG_TESTS=1` skips them deliberately and prints that the SQL was not executed.

**The schema builds from an empty database, and only migrations define it (2026-09-10,
[`docs/STAGE-1-6-MIGRATION-RECONCILIATION.md`](docs/STAGE-1-6-MIGRATION-RECONCILIATION.md)).**
For four months every Supabase Preview branch failed on the third migration, because
`tournaments`, `payments`, `site_settings`, `tournament_updates` and the Storage buckets were
only ever defined by loose scripts under `supabase/` and applied by hand. Five baseline
migrations now capture them and the loose scripts are archived under
`docs/archive/loose-sql/`. Three rules follow. **Never put a `.sql` file directly under
`supabase/` again** — only `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, idempotent, with a
rollback comment. **Production's migration ledger is still drifted** (22 rows for 41 files;
repair commands in the report §8), so **do not run `supabase db push` against production**
until it is repaired — it would re-run nineteen files, one of them data-bearing. And the
from-empty test diffs a fresh build against `docs/production-schema-catalog-2026-09-10.json`:
when you add a migration, expect it to show new objects as FRESH-ONLY until production has
the migration and the catalog is re-captured (the query is `scripts/sql/schema-catalog.sql`).

**`IF EXISTS` guards the child object, never the relation named after `on` — and PostgreSQL 16
hides the difference (2026-09-10, PR #9).** `drop trigger if exists t on public.gone;` is a hard
`42P01` on **PostgreSQL 17**, which is what Supabase runs (verified 17.6 on the Preview branch
itself). **PostgreSQL 16**, which is what a developer machine and this harness usually have,
downgrades the same statement to `NOTICE: relation "public.gone" does not exist, skipping` and
exits 0. So the from-empty suite went green 44/44 on exactly the commit whose Preview branch
stopped dead at file 19 of 41. Nothing was omitted and no preamble hid it — the file set, the
order and the statement were all what Supabase ran; the **servers** disagreed, and the suite was
only reading the exit code. The same trap applies to `drop policy`/`drop rule ... on <relation>`
and to `alter table if exists`. `drop table|index|function|type|view|sequence if exists` each
name their own object and are safe. `scripts/test-migrations-from-empty.ts` now reads the
server's notices, fails on `relation "…" does not exist, skipping` (and *only* that shape — the
similar `trigger "t" for relation "r" …` proves the relation was there), and **proves its own
tripwire is armed** before trusting a green run, by first firing a deliberately broken statement
at a relation that never existed. Keep that self-check: it is the only thing standing between a
tolerant local server and another silent pass. The Preview branch on the pull request remains the
last word on anything else 16 and 17 disagree about.

**Two remediation invariants (2026-09-09, `remediation_stage_1_2_report.md`).** Knowing an
email address never authorises anything: `POST /api/pay/eligibility` answers every caller
with the same neutral body and delivers a one-time magic link by email; the only
capability a signed-out player holds is the HttpOnly `hps_resume` cookie backed by a row
in `registration_sessions` (`src/lib/resume-access.ts`). And a Stripe payment settles
through exactly one path, the database function `finalize_checkout_payment`
(`src/lib/payment-finalize.ts`): amount, currency and event are re-derived from the rows
before a registration is confirmed, replays converge, and the webhook answers 5xx on a
local failure so Stripe retries. Do not add a second writer of `payments` or of
`registrations.payment_status = 'paid'` for card money.

**Three settlement rules learned by running the SQL (2026-09-10,
[`docs/STAGE-1-4-STRIPE-VALIDATION.md`](docs/STAGE-1-4-STRIPE-VALIDATION.md)).**

- **Recording the money outranks recording the link.** `payments` has foreign keys to
  registrations, drop-ins, contacts and tournaments, and two of those ids reach the insert
  straight from Stripe metadata, which is frozen at checkout. A contact deleted by a *merge*
  in the admin used to make the settlement raise `23503` — for ever, because every retry
  carried the same metadata, so the payment was never recorded at all. An unresolvable link is
  now nulled with a note. Never add a link to that insert without asking what happens when the
  row it names is gone.
- **Lock the registration before inserting the payment.** The insert takes `FOR KEY SHARE` on
  the registration through the foreign key; asking the same row for `FOR UPDATE` afterwards is
  an upgrade, and two concurrent settlements for one registration deadlock on it (1 pair in
  12, measured). Order the locks, don't add more.
- **Supabase decides the price, and what was quoted is remembered** (closed 2026-09-10 by
  Stage 1.4.1, [`docs/STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md`](docs/STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md)).
  Checkout used to bill through `stripe_price_id` while settlement validated against
  `entry_fee_cents`, so a drifted Price charged a customer and then refused to confirm them.
  Every session is now created with `price_data` and a server-computed `unit_amount` from
  `priceTournamentCheckout` — the same function settlement calls — and `ResolvedCheckout` has
  no price-id field, so there is nowhere for a second price to come from. Do not reintroduce
  `line_items: [{ price }]`. `tournaments.stripe_price_id` / `stripe_product_id` are still
  written for the Stripe dashboard and read by nothing; they are queued for schema cleanup.
  Separately, `stripe_checkout_attempts` records the amount each session was authorised for,
  and settlement prefers it over today's fee — so editing an event's price cannot invalidate a
  session a customer was already quoted. A session with no attempt row (everything created
  before that migration) falls back to re-deriving, exactly as before.

**Event state has exactly one resolver (2026-09-10, Stage 2.0,
[`docs/STAGE-2-0-EVENT-STATE.md`](docs/STAGE-2-0-EVENT-STATE.md)).** `resolveEventView` in
`src/lib/tournament-state.ts` is what every card, badge, CTA, list order and archive reads; its
`canRegister` / `canPay` *are* `acceptsRegistrations` / `acceptsPayments`, the functions every
money and sign-up route gates on. Never read `status`, `is_draft`, `registration_open` or
`payments_open` in a UI again — `status` is not rewritten when an event ends (D1: finished is
derived), so the Aug-14 open play advertised "Ongoing — Registration Open" with a live sign-up
button for four weeks while `/register` said closed. The admin API takes the one dropdown value
(`state`) and expands it through `storedColumnsFor`; the four columns are no longer accepted
individually. The headline dates decide "finished"; a schedule that runs past `end_date` does not
extend the event, it shows the owner a note on the Schedule tab. `scripts/test-event-state.ts`
proves the frontend can never advertise more than the gates allow, over every combination of
stored columns and calendar.

**Repairing production payments is scoped, not blanket.** `scripts/reconcile-payments.ts
--apply` refuses to start unless the run names what it may write (`--session=`,
`--registration=`, or an explicit `--all`), defaults to one record when scoped, and supports
`--expect-writes` / `--expect-kind` so a surprise is a refusal instead of a write. The banner
says whether the Stripe key is LIVE or test before anything happens. If a run refuses, read
the refusal — do not remove the guard.

**Two FKs now run from `registrations` to `tournaments`** — `tournament_id` and D7's
`free_entry_tournament_id`. PostgREST will not choose between them: any `.select()` that
embeds `tournaments(...)` from `registrations` **must** name the constraint
(`tournaments!registrations_tournament_id_fkey(...)`) or it answers PGRST201 at runtime. It
will pass `tsc` and `npm run build` either way — the ambiguity lives in the database. Six
call sites were rewritten when the column landed (`/pay`, `/me`, the waiver signing screen,
the admin registrations API, `/api/registrations/[id]`, captain paid-ack); add yours to
that habit.

**Admin waiver state has exactly one computation** — `waiverStatusFor` in
`src/lib/admin-roster.ts` — and one display policy, decided by the operator 2026-08-17: a
covered person is a green ✓ whatever the paper trail; the missing-document case is a quiet
tag, and "needs waiver" is reserved for genuinely missing or expired. Do not read
`registrations.waiver_signed` directly in a UI again; that habit is what had the same
person reading "signed" and "pending" on the same page.

**Match results have exactly one writer and one rule.** A match becomes `completed` only
through `PUT /api/admin/tournaments/[id]/matches/[matchId]/result`, which calls the database
function `save_match_result` (score + status + scorers in one transaction). The match PATCH
route rejects scores and status on purpose. "Played" is `isMatchPlayed()` in
`src/lib/schedule.ts` (completed AND both scores), used by the table, the leaderboard, the
public hub and the admin. **A scorer row's `team_id` is always the team the goal counted
for**; an own goal is a row on the benefiting team with `own_goal = true`. Rounds carry
`counts_toward_table`; the semis, final and exhibition are false and `computeStandings`
requires the rounds so nobody can forget. New columns are read only through
`roundCountsTowardTable()` / `=== true` checks, never directly (deploy-order tolerance).

**And note what that migration did to the code already running.** It only *added* things, so it
looked backward compatible — but the second FK breaks every existing unqualified embed the
instant it lands, which meant the **deployed** site, not just the new code. "Migration first,
then deploy" is the right instinct for a new column and the wrong one here. A migration that
adds a second relationship between two tables is a breaking change to every embed between them,
in **both** deploy orders. The zero-downtime path is to ship the constraint-naming fix alone
first (naming a constraint is valid against a one-FK schema too), then migrate, then ship the
feature.

**The webhook trap, found 2026-08-14.** The DocuSeal webhook had **never once delivered** to
this app. It was pointed at the **apex** domain, Vercel 307s apex → www *at the edge*, and
DocuSeal does not follow redirects — it logged every 307 as a success. Green checks on their
side, no requests on ours, nobody alarmed for a month. **Any third-party webhook configured
against `houstonpremiersoccer.com` instead of `www.houstonpremiersoccer.com` dies silently.**
Stripe was audited and is fine. When an integration misbehaves, check the *sender's* configured
URL and delivery log before testing the endpoint — testing the endpoint only proves what the
endpoint does, not what the sender experiences.

**Three rules that are easy to break:**

- **`/register` is the only front door to signing up.** `/pay` without a signed resume
  token redirects there. Do not add a second entry point — that was the bug (plan §A6).
- **Signing in is not required to register or pay.** Sign-in is **Google only** (Apple was
  removed 2026-08-14 — never configured, so it failed every tap). Gating signup on sign-in
  would take the site offline for players (§A8, §9).
- **Nothing reaches a roster without an explicit Confirm, and one live spot per person per
  event is enforced in the database.** `registrations_one_live_spot_idx` will reject a second
  insert with `23505` — report that as "you're already signed up," never a generic error.
  Cancellation is `registrations.cancelled_at`, never `payment_status` (D17–D19, session log
  below).

**The auth trap that cost a week — FIXED 2026-08-14, but read it anyway.** Supabase's
**Site URL and Redirect URLs** must list the real domain. They pointed at
`hps-web-oalvare6s-projects.vercel.app`, and `www.houstonpremiersoccer.com/auth/callback`
matched none of them — so Supabase silently redirected to the Site URL instead of erroring,
`/auth/callback` never ran, and **no player could complete a Google sign-in on the real
domain** (1 MAU, zero `auth.sessions` after 2026-07-01). If sign-in ever "does nothing" or
lands on a strange hostname, check that allow-list *before* reading any code —
[`docs/AUTH-CONFIG.md`](docs/AUTH-CONFIG.md) §1 has the current values.

**One host serves this site: `www.houstonpremiersoccer.com`.** Vercel assigns four other
aliases that used to serve a full working duplicate; the middleware now 308s them to the
canonical host (`src/lib/canonical-host.ts`). Sessions are per-host and `.vercel.app` is on
the Public Suffix List, so a session made on an alias can never be read on the real domain.
Preview deployments are exempt on purpose — don't "simplify" that check away.

| Doc | What |
|---|---|
| [`docs/ASTRA-HANDOFF.md`](docs/ASTRA-HANDOFF.md) | **Start here for product, UI or admin work.** The current system in one read: architecture, the invariants that must not break, the route map, the admin problem to solve, and what a designer is free to change. |
| [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md) | **The active plan.** Start here. |
| [`docs/STAGE-2-0-EVENT-STATE.md`](docs/STAGE-2-0-EVENT-STATE.md) | **Most recent session.** One event-state resolver for every surface: why five pages disagreed about the same event, the `EventView` model, the invariant matrix, the headless-Chromium agreement check, and the business questions left open. |
| [`docs/STAGE-1-6-MIGRATION-RECONCILIATION.md`](docs/STAGE-1-6-MIGRATION-RECONCILIATION.md) | Why every Preview branch failed, the five baseline migrations that make an empty database build, production vs. repository drift object by object, and the ledger repair still owed. |
| [`docs/STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md`](docs/STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md) | Supabase made the single source of price, the authorised amount recorded per Checkout Session, and the Stripe sandbox procedure written down. **Closes the pricing trap Stage 1.4 opened.** |
| [`docs/STAGE-1-4-STRIPE-VALIDATION.md`](docs/STAGE-1-4-STRIPE-VALIDATION.md) | The settlement SQL executed for the first time (against a real PostgreSQL, and `xmax` checked on production's own 17.6): two defects found and fixed, the $80 repair rehearsed, and `--apply` fenced. **Corrects §13 and §15 of the Stage 1.2 report.** |
| [`docs/SESSION-LOG-2026-09-09-RESUME-SMOKE-TEST.md`](docs/SESSION-LOG-2026-09-09-RESUME-SMOKE-TEST.md) | F-01/F-02 deployed and smoke-tested in production: the `formData()` runtime trap, the cookie-clearing reuse bug, and the database evidence. Read with `remediation_stage_1_2_report.md`. |
| [`docs/SESSION-LOG-2026-09-08-COMMUNITY-CUP.md`](docs/SESSION-LOG-2026-09-08-COMMUNITY-CUP.md) | Community Cup schedule, scores and table: the round-centric admin, the phone-first public hub, the one-transaction result save, the own-goal rule, and the spreadsheet import. Read after the plan. |
| [`docs/COMMUNITY-CUP-ACCEPTANCE.md`](docs/COMMUNITY-CUP-ACCEPTANCE.md) | The owner's Friday-night checklist for the new Schedule & scores tab and the public page. |
| [`docs/SESSION-LOG-2026-08-17-ADMIN-DATA-CLEANUP.md`](docs/SESSION-LOG-2026-08-17-ADMIN-DATA-CLEANUP.md) | Production data cleanup (B1 done), the four-way waiver-display contradiction, and the B6 admin consolidation (one page per event). |
| [`docs/SESSION-LOG-2026-08-14-OPEN-PLAY-FREE-ENTRY.md`](docs/SESSION-LOG-2026-08-14-OPEN-PLAY-FREE-ENTRY.md) | D7 free entry, the guest list, the two-FK deploy trap, and why "correct" wasn't "delivered". |
| [`docs/SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md`](docs/SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md) | Earlier the same day: confirm-before-roster, self-cancel, and a 9-way duplicate-registration fix. |
| [`docs/SESSION-LOG-2026-08-14-WAIVERS.md`](docs/SESSION-LOG-2026-08-14-WAIVERS.md) | Earlier the same day: the waiver round trip and pay-later. |
| [`docs/SESSION-LOG-2026-08-14.md`](docs/SESSION-LOG-2026-08-14.md) | Earlier still: auth URLs, one canonical host. |
| [`docs/SESSION-LOG-2026-08-13.md`](docs/SESSION-LOG-2026-08-13.md) | The session before it. |
| [`FOLLOWUPS.md`](FOLLOWUPS.md) | Append-only log of known issues |
| [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) | What is done, what is open, what is deferred |
| [`docs/AUTH.md`](docs/AUTH.md), [`docs/AUTH-RUNBOOK.md`](docs/AUTH-RUNBOOK.md) | Auth config + triage |
| [`docs/PAY-GATE-ACCEPTANCE.md`](docs/PAY-GATE-ACCEPTANCE.md) | Pay gate regression checklist |
| [`.cursor/rules/hps-phases.mdc`](.cursor/rules/hps-phases.mdc) | Conventions (phase list is stale) |
