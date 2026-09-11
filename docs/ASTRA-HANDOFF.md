# Handoff: the current system, for the next product/design agent

> **Stage 2 update (2026-09-11):** this brief was answered by Stage 2.1, the owner-approved admin workspace ([STAGE-2-1-ADMIN-WORKSPACE.md](STAGE-2-1-ADMIN-WORKSPACE.md)); Stage 2.2 (the isolated `hps-dev` project) is complete ([STAGE-2-2-REPORT.md](STAGE-2-2-REPORT.md)) and Stage 2.3 A, B, C and D are built ([STAGE-2-3-PROPOSAL.md](STAGE-2-3-PROPOSAL.md)). The Stage 2.2 planning documents ([CLAUDE-STAGE-2-HANDOFF.md](CLAUDE-STAGE-2-HANDOFF.md), the setup checklist, the readiness matrix) are historical. The architecture and invariants below still hold; the admin-problem sections describe the state Stage 2.1 started from. The Stage 2.0 account below remains architectural background, not the current task status.

**Written 2026-09-10, after Stage 2.0.** This is the primary context document. Read it before
touching product, UI or admin code. It describes what exists now, what you must not break, and
what you are free to redesign.

---

## A. The product

Houston Premier Soccer is a **small local amateur soccer organization** in south Houston. It runs
7v7 tournaments (a season of Friday matchdays with teams, a schedule and a league table) and
open-play nights (one evening, one door price, sides made on the night). Real people, real money.

There is **one owner**, and he is **not technical**. The admin area is his back office and it is
being handed to him. Assume someone standing at the field on a Friday night with a phone in one
hand, not an operator at a desk with training. **The next goal is that admin experience**; public
UI/UX comes after it.

## B. Architecture

Next.js 15 App Router, React 19, TypeScript strict, Tailwind. Almost all server data access goes
through a **Supabase** service-role client, which bypasses RLS — the app authorizes in code, not
in the database. **Player auth** is Supabase, **Google only**, and optional: registering and
paying both work signed out. **Admin auth** is a separate signed HMAC cookie, a different
namespace entirely. **Stripe** Checkout settles through one database function; **DocuSeal** signs
waivers with an in-app fallback; **Resend** sends one-time resume links; **Vercel** hosts, on one
canonical host. Event state is resolved by `resolveEventView` in `src/lib/tournament-state.ts`.

Core tables: `tournaments` (events), `registrations` (one person on one event — the roster row),
`contacts` (people), `teams`, `tournament_rounds`, `matches`, `match_scorers`, `payments`,
`registration_sessions`, `site_settings`. `drop_ins` and `team_members` hold **zero production
rows** — dead *data*, not dead *code*. Guest support is fully built and load-bearing: `drop_ins` has
four API routes, the roster endpoint queries it alongside registrations and **fails the whole roster
load if that query errors**, and the roster screen renders guests with their own paid toggle, CSV
column and total. Decide about that path deliberately; do not assume it is plumbing you would have
to build, and do not break it by accident.

⚠ **Superseded 2026-09-11 by Stage 2.3 item B — read this paragraph as history.** The admin can
now email a roster: audiences are resolved server-side, a dry run is compulsory, sends are
idempotent and outcomes are recorded per recipient
([`STAGE-2-3-PROPOSAL.md`](STAGE-2-3-PROPOSAL.md)). Two limits still hold — nothing is delivered
unless `RESEND_API_KEY` and `RESUME_EMAIL_FROM` are set, and `sent` means the provider accepted it,
not that it arrived. What follows was true until then:

⚠ ~~**The product cannot message a player.**~~ The one email it sends is the resume magic link.
DocuSeal's own invitation is deliberately suppressed (`send_email: false`) on both signing paths,
there is no registration confirmation, no reminder and no way to email a roster; the only receipt
is whatever Stripe is configured to send. Announcements publish to the public event page and
nothing else. The owner's real channel is WhatsApp, by hand. **Do not design "remind unpaid
players", "email the roster" or any notification feature as UI work** — none of the plumbing
exists.

**Scale is small**: 106 people, four events and a biggest-ever roster of 61 (50 of them still live).
Calibrate density for dozens of rows, not thousands.

## C. Invariants — do not break these

Established by a security and correctness programme (Stages 1.2–2.0). These are contracts, not
preferences. A redesign may move every pixel and must preserve every one of them.

1. **Knowing an email address authorizes nothing.** `POST /api/pay/eligibility` answers every
   caller with the same neutral body — no token, no name, no existence signal — and emails a
   one-time link instead. Never build a UI that reveals whether an email is known.
2. **Resume sessions are registration-scoped.** An `hps_resume` HttpOnly cookie backed by a
   server-side row, tied to **one** registration and four scopes (read it, start a payment, start
   a waiver, cancel the spot). Token 20 minutes and single-use, session 24 hours, same-origin
   checked. It is **not a login**, and its cookie `Path=/pay/resume` is load-bearing — move those
   routes and the browser silently stops sending it.
   ⚠ **It is not the only signed-out credential.** A legacy 90-day HMAC `payToken` still travels
   in URLs, is accepted by eight surfaces, and is *more* powerful — it can record a waiver
   signature and a cash declaration. Stage 1.2 removed the oracle that handed one out for an
   email address; it did not remove the token.
3. **Cash receipt is admin-authoritative.** `registrations.payment_method` is what the *player
   said* they would do, never proof of payment. Only the owner asserts cash was received. Never
   conflate intent with receipt.
4. **Waivers: one capture helper, one admin computation, three caveats.** New signatures go through
   `recordSignedWaiver`, and the admin displays through `waiverStatusFor`. But (a) the evidence has
   **three grades** in `waiver_source`: only `docuseal` is a verified provider flow, `in_app` is a
   typed name authorized by the legacy `payToken`, and `admin_override` is the owner's word with
   **no document at all** (the audit attributed 39 evidence-free waivers to the old version of that
   route; today 2 contacts carry the override source and 8 signed registrations have no document
   link). `waiver_signed = true` is never proof a document exists. (b) The helper is **not** a chokepoint on the column: the sign-up route,
   the auto-enrol insert and the contact sync each set `waiver_signed = true` themselves when
   *carrying over* a contact waiver already validated by `isContactWaiverValid`. (c) The
   one-computation rule is **admin-only** — `waiverStatusFor` has two callers, both admin APIs, while
   `/pay`, `/register` and the in-app waiver page read the column directly and deliberately. Never
   read it in an **admin** UI (that habit had one person reading "signed" and "pending" on the same
   page); do not "fix" the player pages to match.
5. **Supabase decides the price.** `entry_fee_cents` is authoritative. The Stripe Price columns are
   still written and **nothing prices from them**, but they are not unread — the admin routes
   compare them before rewriting and the reconcile script checks them for drift, so dropping them
   is a real change. The amount quoted is recorded per Checkout Session so a later fee edit cannot
   invalidate an in-flight session — but that record is **best-effort**: the write is wrapped in a
   `try`/`catch` that logs and continues, and settlement then silently falls back to re-deriving
   today's fee, the exact outcome the record exists to prevent. **Two live slug-keyed hardcodes
   exist for the World Cup event** — its price comes from a constant (its admin fee field is inert)
   and its public league table from `world-cup-standings.ts`, not the computed standings. Surface
   or remove them deliberately; do not discover them by breaking them.
6. **Stripe settlement is one idempotent, convergent path** — `finalize_checkout_payment`. Amount,
   currency and event are re-derived from server rows before a registration is confirmed, replays
   converge, and the webhook 5xxs on local failure so Stripe retries. Never add a second writer of
   `payments`, or of `registrations.payment_status = 'paid'` for card money.
7. **`resolveEventView` is the only authority on event state.** Its `canRegister` / `canPay` *are*
   the functions the money and sign-up routes gate on. **The frontend must never invent its own
   event status:** do not read `status`, `is_draft`, `registration_open` or `payments_open` in a
   component. The stored `status` is not rewritten when an event ends, which is exactly how a
   finished event advertised a live sign-up button for four weeks.
8. **`/register` is the only front door to signing up.** One screen resolves what a person needs;
   do not add a second entry point.
9. **Nothing reaches a roster without an explicit confirm**, and one live spot per person per
   event is enforced by a database index. Report that collision as "you're already signed up".
10. **Migrations are reconciled in the repository, not in production.** **Never run `supabase db
    push` against production**, and never put a `.sql` file directly under `supabase/`.

Three structural constraints that will bite a redesign specifically:

- **Admin pages are client-gated, not server-protected.** `AdminGate` is a client component that
  fetches `/api/admin/me`; the page shell is served to anyone. The real boundary is
  `verifyAdmin()`, called by 43 of the 45 admin API routes (login and logout are the two that do
  not). Every admin page is `"use client"` and fetches its own data. **If you move loading into
  server components, add a server-side check yourself** — none exists under `src/app/admin/`.
  There is also **no automated coverage of any admin screen or admin API route**, so there is no
  safety net under a rewrite.
- **There is exactly one admin identity**, a username and password from environment variables. No
  users table, no roles, no per-person attribution. **Do not design "who changed this", per-user
  permissions, or multiple staff logins**; nothing can supply them.
- Admin routes have **no CSRF check**; the cookie's `SameSite=Lax` is the whole cross-site
  defence. `POST /api/admin/login` has **no rate limit, lockout or delay** either (audit finding
  F-05, still open), against that one static credential. If you redesign the login screen, do not
  make it easier to hammer.

## D. Routes

The README lists them all; four things it omits. `/register` renders **one of six states** and is
the only door. `/waiver/[id]` shows a signed waiver secured by an unguessable UUID and nothing
else. Only `/me` is gated, by middleware. `/admin/diagnostics` is live but unlinked.

## E. The admin problem

Five pages, four nav items: Overview, Events, People, Site. The real work sits in one tabbed event
page (`/admin/tournaments/[id]`, tabs in `?tab=`) — five tabs for a tournament (Roster · Teams ·
Schedule & scores · Announcements · Settings) but only **three** for an open-play night, which has
no teams or schedule; do not assume five. Three components carry most of the weight: the schedule
panel (~1,970 lines), the roster screen (~1,350) and the event form (~1,115), about 44% of ~10,000
admin lines. What works today: the Roster tab is a genuine daily driver (mark paid, assign a team,
sign a waiver on the laptop, add a walk-in), and the Enter-result sheet is properly phone-first.

**Workflows to inspect yourself, in the owner's language:**

- *What needs my attention today?* — closer than you would guess, still not it. The Overview
  **does** aggregate across events: a card per current event reads "*n* signed up · *n* paid · *n*
  still owe · *n* no waiver" in attention colours, over four all-time card-money totals and a
  cross-event payments table. What it never does is **scope to tonight or name a person** — no date
  filter, no drill-through from a count to the people in it, no review-flag or cash signal. The
  counts say a problem exists; finding who is still done from memory.
- *Who owes me money?* / *who hasn't signed a waiver?* — counts on that Overview card; **names**
  only inside one event's roster filter. ~~Cash has no answer anywhere.~~ Stage 2.3 A records cash
  and Zelle properly, so "who owes me" is now answerable for offline money too.
- *Did cash get paid?* — ~~the Paid toggle flips a status and records **no amount, method, date or
  note**, so **cash income has no total anywhere**.~~ **Answered 2026-09-11 by Stage 2.3 item A.**
  `manual_payments` records amount, method, the date the money changed hands, a note and who took
  it, through one writer (`record_manual_payment`). The table is append-only: a correction voids a
  receipt and enters a new one, so it is an audit history rather than a current opinion. Stripe
  remains authoritative for card settlement and is never overwritten by a receipt.
- *Teams and rosters* — assignable in two places with different powers.
- *Scores* — round-centric entry, but **the league table exists only on the public site**, so the
  owner leaves the admin to see the result of what he just typed.
- *Exceptions* — the Paid toggle is lossy for `waived` / `partial` / `refunded`, and an event's
  stat cards and the roster totals ten pixels below them come from different endpoints and can
  legitimately disagree. `needs_admin_review` is set by seven different things (contact
  collision at signup, the World Cup captain-paid claim, three branches of `finalize_checkout_payment`,
  two of `record_manual_payment`) ~~but shows as one small chip whose tooltip describes only one of
  them, with no filter and nothing that clears it. Worse, the machine-written explanation of why a
  row is flagged already exists in the `notes` columns and no admin screen reads it~~ — **fixed:
  Stage 2.1 added the filter, Stage 2.3 D (2026-09-11) reads every writer's sentence back with a
  "what to do", recomputes what is unsafe right now from the rows, and added the one route that
  clears the flag, refusing while something is still wrong.** See `src/lib/admin-review.ts`.

**Know the API's limits before scoping UI.** A roster row accepts exactly four fields
(`payment_status`, `team_id`, `emergency_name`, `emergency_phone`). Recording a cash *amount* or a
note was called out here as **an API change with settlement implications, not UI work** — which is
exactly what Stage 2.3 item A turned out to be, and it landed as its own table, its own writer and
its own route rather than a fifth field on this one. Removing someone is
the opposite case: `DELETE /api/admin/registrations/[id]` already soft-cancels properly — stamps
`cancelled_at`, appends a note, keeps the history — and ~~no admin screen calls it~~ Stage 2.1
wired it: roster removal confirms inline and calls this endpoint.

⚠ **Deleting an event is the sharpest edge in the admin**: an unguarded hard delete behind one
inline confirm. Registrations and payments are `ON DELETE SET NULL` and survive detached, but
`teams`, `tournament_rounds`, `matches`, `drop_ins` and `tournament_updates` all **cascade**, and
`match_scorers` cascades from `matches`. One confirm irrecoverably destroys the whole schedule,
every score and scorer, all teams, all guest rows and every announcement. The button's own tooltip
omits this. Deleting a *person* is properly refused when they have history; give events at least
that guard.

Also missing: draft preview ("View public page" on a draft lands on Next's bare 404 — there is no
`error.tsx` or `not-found.tsx` anywhere), and any PWA or offline handling despite the
phone-at-the-field scenario.

Stage 2.1 **may dramatically redesign the admin's information architecture and visual experience.**
Think in owner workflows — attention today, registrations, unpaid and needs-review money, waivers,
events, teams and rosters, schedules and scores, exceptions — not in the current page list.

## F. Design freedom

**You do not need to preserve the current visual design or component layout merely because it
exists.** It grew feature by feature under deadline; it is not a considered system.

What is actually there: one permanently dark theme (near-black navy, cyan accent) built on **15 CSS
custom properties** in `:root` — eight primitives plus a forked semantic set of seven, of which only
seven are re-exported as Tailwind tokens. Replacing the palette means touching all fifteen, not the
seven the config shows you. There is **no cross-cutting Button / Input / Card / Badge layer**: four
`@apply`-ed CSS classes plus copy-pasted Tailwind, with form fields alone in ~14 variants. (Real
shared components do exist: `AdminDialog`, `EventStateBadge`, the hub's `TeamLabel` / `ScorerList`.)
Admin and public paint the same event state in different palettes. Team colours are arbitrary
owner-picked hex rendered as dots throughout, so any new palette must survive white, black and
near-background jerseys.

**The cyan is not the brand.** The only genuine brand artefact is the crest at
`public/brand/hps-badge.png`, which is **monochrome black**; the operator's own flyer uses royal
blue and gold. The cyan-on-navy look is a developer choice with nothing behind it — **replace the
entire palette if you want to.** Most marketing photography is hardcoded stock.

You **must** preserve: the invariants in §C, the security boundaries, the data contracts, and the
identity worth keeping — the crest, the name, and the fact that this is a Houston soccer club.

You **may** substantially rethink: admin navigation, dashboard hierarchy, information density,
components, responsive layouts, interaction patterns, and the visual system as a whole. Two things
worth fixing on the way: there is **no reduced-motion handling** at all, and mobile discipline is
real on the newer screens but absent on older ones — including the roster, the screen most used on
a phone.

One caution on taste: **avoid a generic SaaS dashboard.** It should feel like it belongs to a soccer
club in Houston, to the people who run Friday nights under the lights — not to an analytics product.
Design for one non-technical owner holding a phone at the field.

## G. Known remaining issues

- **No Stripe webhook delivery has ever been recorded** (`stripe_webhook_events` is empty), so the
  deployed endpoint is not proved end to end. The sandbox procedure needs an operator with a
  test-mode key.
- **One historical payment is still unreconciled** — a registration left unpaid against a
  succeeded Stripe payment, re-verified 2026-09-10. The repair is rehearsed and scoped, not run.
- **Refunds and disputes are deliberately unhandled.** A refund is an admin-set status only, and
  because the Stripe row still reads `succeeded` it permanently blocks that player's self-cancel.
- **The DocuSeal webhook is not replay-protected.** The guard table and function exist in
  production and in the migrations, but no code calls them — that work was written on a branch
  that never merged. A replayed delivery can re-stamp a signature date and extend a waiver.
- **Waiver validity is stricter at the gates than in the admin display**, so the roster can show a
  green tick for someone a youth/adult gate would refuse. Do not read that as one policy: the green
  tick *whatever the paper trail* is a deliberate operator decision, but the type-blindness is a
  defect — `waiverStatusFor` is never passed a `waiver_type` at all, while `isContactWaiverValid`
  hard-refuses on a mismatch.
- **There is no single definition of "settled."** Several coexist; pick one and name it.
- **Two audit findings are still open.** F-00: a service-role key, the JWT secret and the Postgres
  password sat behind a public preview URL for two months; the exposure was closed but **rotation
  was deferred and never done**. F-05: no brute-force protection on admin login (§C).
- Plus the ledger repair (§C10), and Stage 2.0's open questions: `max_teams` caps teams but gates
  nothing; a schedule running past an event's end date warns the owner rather than extending the
  event; and there is no "registration opens at", so "not open yet" and "closed" look identical.

**Public-site UX, SEO, accessibility and performance come after the admin.**

## H. What to read

**Current and authoritative:** [`../README.md`](../README.md), [`../CLAUDE.md`](../CLAUDE.md)
(conventions and traps already paid for — read it fully), [`PROJECT-STATUS.md`](PROJECT-STATUS.md),
and the stage reports those index. [`REBUILD-PLAN.md`](REBUILD-PLAN.md) holds the operator's locked
product decisions (D1–D10): its *phase status* is dated, its *decisions* are not.

**History, not truth.** `FOLLOWUPS.md`, the `SESSION-LOG-*` files and
`remediation_stage_1_2_report.md` record how decisions were reached. **Do not treat them as the
current architecture.** `backend_audit_v1.md` is the most dangerous: its headline findings describe
code that Stages 1.2–1.4 rewrote, so quoting it produces confidently false statements — with two
exceptions, F-00 and F-05, which are still open and listed in §G.

**Above all, the code is the truth.** When a document and `src/` disagree, believe `src/` — and
fix the document.
