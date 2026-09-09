# Houston Premier Soccer — Stage 1 Backend Integrity Audit

**Scope:** architecture, source of truth, registration, Stripe, Supabase integrity, auth, waivers/DocuSeal, failure states, secrets, observability.
**Date:** 2026-09-09 (America/Chicago). **Repo:** `oalvare6/HPS-WEB` @ `be48b67` (branch `claude/houston-premier-soccer-audit-elm2ae`).
**Method:** static read of the full `src/` and `supabase/` trees; read-only introspection of the production Supabase project (`pg_constraint`, `pg_indexes`, `pg_policies`, `pg_proc`, aggregate `COUNT(*)` queries only, no row-level PII pulled); read-only GETs against `https://www.houstonpremiersoccer.com` via the Vercel connector (direct egress from this session is blocked by policy); local `npx tsc --noEmit` and the 11 pure test scripts (179/179 pass).
**Nothing was modified:** no application code, configuration, migration, database row, or deployment. The only file created is this one.

Confidence labels: **CONFIRMED** = shown by code + schema + production data; **LIKELY** = code shows it, runtime evidence partial; **POSSIBLE** = the architecture permits it, no occurrence found; **UNVERIFIED** = insufficient evidence.

---

## 1. Executive Diagnosis

The backend is in materially better shape than the "vibe-coded" hypothesis predicts. The money path is sound where it matters most: **the browser never sets a price** (`src/app/api/stripe/checkout/route.ts:53-235` derives every amount from the `tournaments` row, a Stripe Price, or a constant), **the Stripe webhook verifies its signature** (`src/app/api/stripe/webhook/route.ts:14`), **the success page does not trust the redirect** (it retrieves the session from Stripe and requires `payment_status === "paid"` before writing, `src/app/pay/success/page.tsx:177-185`), and **duplicate payment rows are impossible at the database** (`payments_stripe_session_id_key` and a partial unique index on `stripe_payment_intent_id`, both confirmed live). Registration duplicates are likewise blocked in the database (`registrations_one_live_spot_idx`, confirmed live), match results are written by a single Postgres function inside one transaction (`save_match_result`, confirmed live), and every one of the 37 admin route files gates with `verifyAdmin()` before touching the database. Row Level Security is enabled on every table and denies anonymous access to every table holding personal data. These are deliberate, correct designs and the report says so where each is checked.

The problems are narrower and more specific than "duplicated state everywhere", and they cluster around four root causes.

**1. Email is the only identity on the unauthenticated surface, and a signed capability token is minted from it.** `POST /api/pay/eligibility` takes an email and a public tournament id and, for anyone with a pending registration, returns the HMAC pay-resume token (`src/lib/pay-eligibility.ts:544-564`). That token is the sole authorization for cancelling the registration (`/api/registrations/[id]/cancel`), declaring payment method, reading the registrant's email and first name, and signing a youth waiver in their name. The only guard is an in-memory 30 requests/minute/IP counter. This is the highest-severity application flaw found (P1). The same email-only binding lets an anonymous caller write `team_name`/`notes` onto another person's registration through `/api/stripe/checkout`, and lets anyone who knows a returning player's email create a registration that inherits that player's signed waiver.

**2. Payment truth and registration truth are two writes with no reconciliation loop.** `recordCheckoutSessionPayment` inserts the `payments` row, then updates `registrations.payment_status` as a second statement (`src/lib/stripe-payments.ts:94-155`). If the second write fails, every later retry short-circuits on "already recorded" (`:59-61`) and never flips the registration; the webhook returns HTTP 200 even on error (`webhook/route.ts:22-25, 38`) so Stripe does not retry; nothing handles refunds or asynchronous payment methods. Production holds **one live instance today**: a Community Cup registration with a succeeded $80 Stripe payment linked by `registration_id` whose status is still `pending` (created 2026-08-22). P1.

**3. Event state has two vocabularies that only the money paths reconcile.** `src/lib/tournament-state.ts` correctly derives "finished" from dates and every checkout, eligibility and signup path gates on it. But the public list card, the event-page header badges, the `/events` sort order and the homepage "Recent Events" badge still read the stored `status`, `registration_open` and `payments_open` columns directly. Production shows this today, verified against the live HTML: the 2026-08-14 open play night is stored as `status='ongoing', registration_open=true, payments_open=true`, and `/events` renders it as "Ongoing — Registration & Payments Open" with a "Sign up to play" button while the event page's own CTA card says "Past event", the homepage archive says "Completed", and `/register` shows "closed". Community Cup, two rounds into its season, still reads "Upcoming" on three surfaces. No money can be taken (the gates hold), so this is P2, but it is exactly the kind of contradiction the operator will be asked about.

**4. The schema is not reproducible from the migration ledger, and the ledger disagrees with the files.** Five tables exist only in undated loose `.sql` files; the production `supabase_migrations` ledger lists 22 entries with different version stamps from the 30 files in `supabase/migrations/`; a production CHECK constraint still allows `registration_type` values the repo's baseline migration rejects. Every "deploy before migrate" trap recorded in `CLAUDE.md` descends from this. P2.

Two further items deserve the owner's attention even though they are operational rather than architectural: the **Supabase service-role key, JWT secret and Postgres password were publicly exposed for eight weeks (2026-06-19 to 2026-08-14) and the project's own follow-up log records that they were never rotated** (P0 by this audit's rubric, LIKELY — rotation is not evidenced anywhere); and the **admin login has no brute-force protection** on a single static username/password with a 30-day cookie (P2).

Everything else found is P3 or a documented, deliberate trade-off. The remediation order in §14 is: rotate the exposed keys; bind pay tokens to ownership; make the payment→registration flip idempotent and retryable; converge the public surfaces on the derived event state; reconcile the migration ledger; then observability.

Counts: **1 P0, 2 P1, 6 P2.**

---

## 2. Critical Architecture Map

**Stack (installed, from `package-lock.json`):** Next.js **15.5.9** (App Router only; no `pages/`), React 19.2.3, `@supabase/supabase-js` 2.106.1, `@supabase/ssr` 0.10.3, `stripe` 20.4.1 (API version pinned `2026-02-25.clover`, `src/lib/stripe.ts:8`), TypeScript 5.9.3 strict. No test framework: tests are `scripts/test-*.ts` run with `tsx`. No server actions (grep for `"use server"`: none). All mutations are Route Handlers under `src/app/api/**`. Every data page is `export const dynamic = "force-dynamic"` (`src/app/page.tsx:22`, `events/page.tsx:26`, `events/[slug]/page.tsx:66`, `register/page.tsx:37`, `pay/page.tsx:28`, `pay/success/page.tsx:21`), so there is no Next.js render cache in front of event state; the only `unstable_cache` is site settings (`src/lib/site-settings.ts:1`), invalidated by tag from the admin route.

```
Browser
  │  (no Supabase browser client is used for data; only for OAuth sign-in)
  ▼
Next.js 15 (Vercel, one canonical host www.houstonpremiersoccer.com; middleware 308s aliases)
  ├─ middleware.ts ............ canonical host → Supabase session refresh → /me/* requires session
  ├─ Server Components ........ read via supabaseAdmin (service role) — every public page
  ├─ Route Handlers /api/** ... write via supabaseAdmin (service role)
  │     public:   /api/register, /api/register/join (session), /api/register/payment-intent (token),
  │               /api/pay/eligibility, /api/pay/options, /api/stripe/checkout,
  │               /api/registrations/[id] (token), /api/registrations/[id]/cancel (token|session),
  │               /api/waiver/sign (token), /api/me/* (session), /api/analytics
  │     webhooks: /api/stripe/webhook (Stripe-Signature), /api/docuseal/webhook (HMAC)
  │     admin:    /api/admin/** (37 files, HMAC cookie `admin_token`)
  ▼
Supabase Postgres 17 (project jqkiswwunrnyqjgroqtn)
  ├─ RLS on all 13 tables; anon SELECT only on tournaments(is_draft=false), rounds, updates,
  │   matches, match_scorers, site_settings. contacts/registrations/payments/… have zero policies.
  ├─ Supabase Auth: Google OAuth only (15 google + 24 email identities live; 38 users)
  └─ Functions: save_match_result, clear_match_result, open_play_attendees (service_role only)
Stripe ── Checkout Sessions (mode=payment) → webhook checkout.session.completed → payments row
DocuSeal ── submissions created server-side; completion via webhook OR polled by the app
```

**Trust boundaries and privileged code**

| Client | File | Key | Where it runs |
|---|---|---|---|
| `supabaseAdmin` (service role, bypasses RLS) | `src/lib/supabase-admin.ts:5-27` (lazy Proxy `:33-42`) | `SUPABASE_SERVICE_ROLE_KEY` | Every server page and every route handler. **This is the only client used for data.** |
| `createSupabaseServerClient` (anon + cookies) | `src/lib/supabase-server.ts:14-44` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `getCurrentAuthUser` only (`src/lib/player-auth.ts:34-52`) — session validation via `auth.getUser()` |
| `createSupabaseMiddlewareClient` | `supabase-server.ts:57-95` | anon | `src/middleware.ts:38-51` session refresh |
| `createSupabaseRouteHandlerClient` | `supabase-server.ts:107-139` | anon | `/auth/callback`, `/auth/signout` |
| `createSupabaseBrowserClient` | `src/lib/supabase-browser.ts:16-32` | anon | `OAuthButtons`, `SignOutButton` only |
| Stripe SDK | `src/lib/stripe.ts:3-18` singleton | `STRIPE_SECRET_KEY` | checkout, webhook, success page, sync-payments, admin pricing sync, drop-in pay link |
| Admin identity | `src/lib/admin-auth.ts:6-31`, `src/lib/app-signing.ts:37-78` | `APP_SIGNING_SECRET` (legacy alias `ADMIN_SESSION_SECRET`) | HMAC-SHA256 cookie, 30-day (`src/lib/admin-session.ts:15`) |
| Player→record capability | `src/lib/app-signing.ts:80-119` | same secret | "pay-resume token": HMAC over `{rid, exp}`, **90-day** validity |

Consequence: RLS protects nothing the application does, by design. Authorization is entirely in application code, before each `supabaseAdmin` call. §10 evaluates that per route.

---

## 3. Source-of-Truth Matrix

| Concept | Current source(s) | Relevant code/table | Competing source? | Effective authority | Risk |
|---|---|---|---|---|---|
| Event identity | `tournaments.id` (uuid), `slug` UNIQUE | `tournaments` (`supabase/tournaments.sql:3-27`) | World Cup slug hard-coded (`src/lib/world-cup-pricing.ts:2`) | DB row | Low; slug constant only branches pricing/standings for one past event |
| Event status | `tournaments.status` (upcoming/ongoing/completed/cancelled) **and** derived `resolveEventState()` from dates + `is_draft` + flags | `src/lib/tournament-state.ts:107-116` | **Yes** — stored `status` vs date-derived state | Split: money/signup paths use derived; list cards, header badges, `/events` sort, homepage archive badge use stored | **Medium** — contradictory labels on the same page (§4, F-03) |
| Event visibility | `is_draft` | `getPublicTournaments` `src/lib/tournaments.ts:56-75`; RLS policy `is_draft = false` | `status='cancelled'` also excluded in queries | DB + app agree | Low. Gap: rounds/matches/updates of a draft are anon-readable via PostgREST (`using (true)` policies) |
| Registration availability | `registration_open` AND derived state = open | `acceptsRegistrations` `tournament-state.ts:159-164` | Raw `registration_open` read by `tournamentPrimaryCta` (`src/lib/tournament-public-links.ts:56`), homepage hero (`src/app/page.tsx:57,171`), header badge (`events/[slug]/page.tsx:631`) | Backend: derived. Display: raw flag | Medium (display only) |
| Payment availability | `payments_open` AND derived state = open | `acceptsPayments` `:151-156`; enforced in checkout `:76`, eligibility `:421`, options, pay-by-slug | Raw flag in `TournamentCard.statusLabel` and header badge | Backend: derived | Low |
| Registration deadline | None. Only start/end dates. | — | — | Dates | n/a |
| Event start/end | `start_date`, `end_date` (timestamptz, written as noon UTC) | `eventDay()` `tournament-state.ts:29-33` | `recurrence` free text used for display | DB | Low |
| Current/featured event | `is_featured` (cap 3) filtered by `!isPastEvent`; fallback by stored status | `getFeaturedTournaments` `tournaments.ts:141-188` | Fallback query uses stored `status in ('upcoming','ongoing')` then date filter | DB flag + date backstop | Low |
| Pricing | `entry_fee_cents` (source), `entry_fee` (legacy decimal, derived at write `admin/tournaments/[id]/route.ts:70-78`), `drop_in_fee_cents`, `stripe_price_id` (synced from `entry_fee_cents`), World Cup constants | `checkout/route.ts:146-187`; `src/lib/stripe.ts:45-132`; `world-cup-pricing.ts:5,49-54` | Yes: 4 representations, kept in sync at admin write time. Checkout uses `stripe_price_id` when present (`:455`), else `entry_fee_cents` | Server-side only | Low today; a manual Stripe price edit would diverge silently |
| Team capacity | `tournaments.max_teams` — display only | `events/[slug]/page.tsx:561-562`; `TournamentTeamsPanel.tsx:43` | — | **Nothing enforces it** | Low (owner-managed) |
| Roster capacity | **No column, no check** | — | — | None | n/a — events are not capacity-limited in code |
| Player registration | `registrations` row with `cancelled_at IS NULL` | `registrations_one_live_spot_idx` | `drop_ins` (0 rows ever), `team_members` (0 rows ever, still has admin UI) | `registrations` | Low; dead tables are noise |
| Team membership | `registrations.team_id` | `resolveTeamIdForTournament` `tournaments.ts:353-369` | `registrations.team_name` (free text, World Cup era), `team_members` (dead) | `team_id` | Low now; `team_name` still written by checkout for World Cup (`checkout:254-256`) |
| Waiver validity | `contacts.waiver_signed_at/expires_at/type` (365 days) **and** `registrations.waiver_signed/waiver_signed_at` | `isContactWaiverValid` `src/lib/contacts.ts:43-55`; `waiverStatusFor` `src/lib/admin-roster.ts:177-194` | Yes — two tables; registration is copied from contact at signup; DocuSeal is polled as tie-breaker (`waiver-reconcile.ts`) | Contact for "may skip"; registration for "this signup is covered"; admin uses either-valid | Medium: same person can be "signed" on the registration and "expired" on the contact; handled explicitly by `signup-state.ts:106` |
| Payment status | `registrations.payment_status` (pending/paid/partial/waived/refunded) | written by webhook/success (`stripe-payments.ts:148-151`), admin toggle (`admin/registrations/[id]/route.ts:58-66`), free-entry (`pay-eligibility.ts:235`) | `payments.status` (only ever `succeeded` in prod, 60/60) | `registrations.payment_status` is what every screen reads; `payments` is the Stripe ledger | **High**: two writers, one-way sync, no refund path (F-02) |
| Match state | `matches.status` + scores; `completed` only via `save_match_result` | DB function + `matches_completed_has_scores` CHECK | Match PATCH route rejects scores/status by design | DB | Low — correct |
| Scores | `matches.home_score/away_score` | same | — | DB | Low |
| Standings | Derived at render: `computeStandings(teams, matches, rounds)` (`src/lib/standings.ts`) | `events/[slug]/page.tsx:359-363` | **World Cup: hard-coded override** `src/lib/world-cup-standings.ts` (deliberate, documented REBUILD-PLAN §10) | Derived, except one past event | Low |
| Scorer statistics | Derived: `computeTopScorers(matches)`; `own_goal` excluded | `standings.ts` | — | Derived | Low |
| Event completion | Derived from `end_date ?? start_date < today (Houston)` | `isPastEvent` `:61-67` | Stored `status='completed'` (set by hand/scripts; never written by the form — `deriveStoredStatus` never returns it) | Dates | Medium: two of four prod rows carry `completed`, one finished row carries `ongoing` (§4) |

---

## 4. Event State Decision Map

Production rows on 2026-09-09 (public columns only):

| Slug | stored `status` | `registration_open` | `payments_open` | `is_featured` | dates | derived state |
|---|---|---|---|---|---|---|
| memorial-day-open-play-2026 | completed | false | false | false | 2026-05-25 | finished |
| world-cup-summer-tournament | completed | false | false | **true** | 2026-06-08 → 07-17 | finished |
| open-play-july-27-28-2026 (titled "Friday August 14th") | **ongoing** | **true** | **true** | true | 2026-08-14 | **finished** |
| community-cup-fall-2026 | upcoming | true | true | true | 2026-08-21 → 10-23 | open |

How each surface decides, with the Aug-14 row as the worked example:

| Surface | Appears? | Upcoming/Completed label | Accepts registration | Accepts payment | Featured | Evidence |
|---|---|---|---|---|---|---|
| Homepage hero / Featured | `is_featured && !is_draft && status≠cancelled && !isPastEvent` → Aug-14 and World Cup **excluded** (dates) | Card uses `tournamentPrimaryCta` (raw flags) | n/a | n/a | Date backstop applied | `tournaments.ts:143-161`; hero link reads raw `registration_open` `page.tsx:56-60,171` |
| Homepage "Recent Events" | derived `finished` → Aug-14 **included** | **`recentEventStatus(t.status)`** → stored `ongoing` ≠ `upcoming` → shows "Completed" (correct by accident); an event with stored `upcoming` that has passed would show **"Upcoming"** in the archive | — | — | — | `page.tsx:29-34,343`; `tournaments.ts:399-422` |
| `/events` list | all non-draft, non-cancelled | **Sort by stored `status`** (`events/page.tsx:8-24`); card strip `STATUS_PILL[t.status]` + raw flags → Aug-14 renders **"ONGOING — REGISTRATION & PAYMENTS OPEN"** with pulse; CTA `tournamentPrimaryCta` → raw `registration_open` → **"Sign up to play"** | (display) | (display) | — | `TournamentCard.tsx:18-31,46,57-68,128-140`; `tournament-public-links.ts:55-73` |
| `/events/[slug]` header | `getTournamentBySlug` (draft → 404) | Pill = `STATUS_PILL[tournament.status]` → **"Ongoing"**; badges "Registration Open" (raw) and "Payments Open" (raw, gated only on `status !== 'completed'`) | (display) | (display) | — | `events/[slug]/page.tsx:370,619-641` |
| `/events/[slug]` CTA card | — | `viewerEventCta({isFinished: resolveEventState()==='finished'})` → **"Past event"**, no button | derived | derived | — | `:392-398`; `tournament-public-links.ts:145-154` |
| `/register` | explicit slug loads any non-draft; picker lists `getRegistrationOpenTournaments` (flag AND derived) | `acceptsRegistrations` → `closed` card for Aug-14 | **derived** | **derived** | — | `register/page.tsx:60-85,113-118`; `signup-state.ts:87-89` |
| `/pay` | `getPayableTournamentBySlug` → null unless `acceptsPayments` | "Payments not available" | — | **derived** | — | `tournaments.ts:221-244`; `pay/page.tsx:164-166,291-300` |
| `POST /api/register` | — | — | **derived** (`acceptsRegistrations` `:75,87`) | — | — | `register/route.ts:64-98` |
| `POST /api/register/join` | — | — | **derived** `:84` | — | — | |
| `POST /api/stripe/checkout` | — | — | — | **derived** `:76,219` | — | |
| `POST /api/pay/eligibility`, `GET /api/pay/options` | — | — | — | **derived** | — | `pay-eligibility.ts:421`; `pay/options/route.ts:24` |
| Admin | `EventStateBadge` derived; the form derives `status/registration_open/payments_open` from one dropdown (`TournamentForm.tsx`) | derived | — | — | — | but `PATCH /api/admin/tournaments/[id]` accepts all four columns independently (`:46-52`) |

**Verified live on 2026-09-09 (GETs via the Vercel connector; excerpts in F-03):**
- `/events` renders the Aug-14 open play as **"Ongoing — Registration & Payments Open"** (green, pulsing) with a **"Sign up to play"** button to `/register?tournament=open-play-july-27-28-2026`; the homepage "Recent Events" shows the same event as **"Completed"**; its event page shows pills **Ongoing / Registration Open / Payments Open** directly above a **"Past event — This event has ended"** card, and still prints "Free for Community Cup - Fall 2026 players — sign in to claim your free spot."; `/register?tournament=…` answers "isn't taking sign-ups at the moment"; `/pay?tournament=…` answers "Payments not available". Five surfaces, four states, every listed CTA dead on click.
- Community Cup (in play since 2026-08-21, Round 2 results and "Next: Round 3 · Fri, Sep 11" on its own page) is **"Upcoming"** on the homepage, `/events` and its header pill — the stored `status` is only rewritten when the owner saves the form (`deriveStoredStatus`), and nobody has.
- The money and signup gates held on every closed event (`/register` closed card, `/pay` "Payments not available", `/api/pay/options` excludes them); `/pay?tournament=community-cup-fall-2026` redirects to `/register` as designed; `/api/admin/*` → 401; `/api/me/status` → `{authed:false}`; `/api/stripe/webhook` GET → 405; the `.vercel.app` alias → 308 to `www`.

**Root cause (F-03):** two vocabularies. `tournament-state.ts` was introduced as a backstop for money and signup, and those paths were migrated. The presentational readers of `status`, `registration_open` and `payments_open` were not, and `deriveStoredStatus` never writes `completed`, so a finished event's stored status is permanently whatever it was on its last day. The stored columns therefore drift from reality by design, and every surface that still reads them is wrong on exactly the events the archive exists for. Formulas differ across five files; the fix is one accessor.

---

## 5. Registration Timeline

Two entry points converge on one row. Both begin at `/register?tournament=<slug>` (the only front door: `/pay` without a token redirects there, `pay/page.tsx:176-178`; every public CTA links there).

**Path A — new or signed-out player (`RegistrationForm` → `POST /api/register`)**

| # | Step | Where | Validation / auth | DB / external | Result state | Failure behaviour |
|---|---|---|---|---|---|---|
| A1 | Page resolves event and state | `register/page.tsx:60-118` | `acceptsRegistrations`; if signed in, `findEventRegistration` + DocuSeal reconcile | reads | renders `full_signup` | load error → full form (API re-validates) |
| A2 | Form POST | `RegistrationForm.tsx:203-283` (`isSubmitting` guards the button `:466`) | — | — | — | error text shown; button re-enabled |
| A3 | Field validation | `register/route.ts:117-131` | all 8 fields required; **no auth, no rate limit** | — | 400 | |
| A4 | Contact upsert by email | `:135-142` → `upsertContactByEmail` `contacts.ts:65-146` | email lowercased; existing contact only has *blank* fields filled | **W contacts** | contact exists | 500, no registration |
| A5 | Tournament resolution | `:152` → `resolveTournament` `:64-98` | must `acceptsRegistrations`; else single open event; else `null` | R tournaments | may be **null** (row with no event) | — |
| A6 | Team resolution | `:156` → `resolveTeamIdForTournament` | team must belong to the event; unknown → null | R teams | | |
| A7 | **Registration INSERT** | `:158-177` | `waiver_signed=false`, `payment_status='pending'` | **W registrations** | pending row | `23505` (`registrations_one_live_spot_idx`) → 409 "already signed up" `:183-192`; other → 500 |
| A8 | Contact link by phone | `:204-212` → `linkRegistrationToContact` | may flip `contact_id` and set `needs_admin_review` | W registrations | | swallowed (warn) |
| A9 | Mint pay-resume token | `:218-227` → `createPayResumeToken` | HMAC, 90 days | — | | 500 (row already exists) |
| A10a | **Waiver skip** if contact waiver valid for this type | `:234-295` | copies `waiver_signed_at`, `waiver_document_url`, `docuseal_submission_id` from contact | W registrations, W contacts | `waiver_signed=true` | 500 after insert → row exists, unsigned |
| A10b | DocuSeal not configured → in-app signing | `:302-323` | | W `docuseal_status='sent'` | returns `/register/waiver/[id]?payToken=` | |
| A10c | DocuSeal submission | `:325-390` | `send_email:false`, metadata `{registration_id, contact_id}`, `completed_redirect_url` = pay page with token | **POST api.docuseal.com**; W `docuseal_submission_id/sign_url/status` | returns sign URL | DocuSeal error → **500 "Registration saved but waiver could not be created"** — row exists, `docuseal_status='pending'`; player has no link (recoverable only via `/register` revisit while signed in, or admin) |
| A11 | Browser | `RegistrationForm.tsx:250-275` | | | `window.location = signUrl` | |
| A12 | Sign (DocuSeal) → redirect to `/pay?registrationId&payToken` | `pay/page.tsx:143-161` | token verified; **`reconcileWaiverForRegistration` asks DocuSeal** (`waiver-reconcile.ts:152-242`) and writes via `recordSignedWaiver` | W registrations + contacts | `waiver_signed=true` | DocuSeal unreachable → treated as unsigned → `NeedsWaiverCard` (`pay/page.tsx:301-323`) |
| A13 | Pay (card) or declare cash | `PayForm` → `/api/stripe/checkout`; `PaymentChoice` → `/api/register/payment-intent` | token; waiver must be signed (`payment-intent:118-136`) | | | |

**Path B — signed-in returning player with a valid waiver (`QuickJoinCard` → `POST /api/register/join`)**

| # | Step | Where | Validation / auth | DB | Result | Failure |
|---|---|---|---|---|---|---|
| B1 | Session → contact by email | `join/route.ts:41-47` → `getCurrentPlayer` `player-auth.ts:75-133` | Supabase `auth.getUser()`; contact matched by email; **inserts a contact if none** | R/W contacts | | 401 |
| B2 | Event gate | `:66-89` | `acceptsRegistrations` | R | | 400/404 |
| B3 | Existing live row? | `:103-115` | by `(tournament_id, contact_id, cancelled_at null)` | R | reuse row; team change refused if already set `:150-159` | |
| B4 | Waiver gate | `:120-125` | `isContactWaiverValid` | — | 409 → full signup | |
| B5 | Free entry (open play only) | `:197-208` → `loadOpenPlayEntitlement` | derived from DB, never from body | R registrations | | fail closed → must pay |
| B6 | **INSERT** `enrollContactInTournament` | `pay-eligibility.ts:198-255` | copies contact fields; `waiver_signed=true`; `payment_status` `'waived'`+`payment_amount=0` if free else `'pending'`; `payment_method` in same insert | **W registrations** | | `23505` → 409 `already_registered` |
| B7 | Token + pay URL | `:248-280` | | | | |

**What defines "registered"?** A row in `registrations` with `cancelled_at IS NULL` for `(tournament_id, contact_id)`. It is created by A7 or B6 — i.e. by the **explicit form submit / Confirm tap**, not by payment, not by the waiver, not by the webhook. The roster (`admin/tournaments/[id]/roster/route.ts:93-111`), the event page CTA (`event-standing.ts:67-86`) and the public open-play attendee list (`open_play_attendees` SQL, `cancelled_at is null`) all read exactly this. Payment (`payment_status`) and waiver (`waiver_signed`) are attributes of that row, and the plan's own rule "waiver is a hard gate on roster membership" is enforced only at *payment-intent* and *checkout* time, not at insert: an unsigned, unpaid row is on the roster with a red ✗. CONFIRMED (`admin-roster.ts:209-227` counts it in `signedUp`).

There is no roster insertion separate from registration; `team_members` is dead (0 rows in production).

---

## 6. Stripe Timeline

| # | Step | Where | What is trusted | Evidence |
|---|---|---|---|---|
| S1 | Client POSTs `{email, tournamentId | dropInId | registrationId+payToken, payKind, rosterSize, teamName}` | `PayForm.tsx:340-352` | — | |
| S2 | Token branch: registration must exist, not cancelled, not paid, **email must equal registration email**, tournament from the row | `checkout/route.ts:309-378` | `registrationId` bound by HMAC token | |
| S3 | `tournamentId` branch: **no auth**; tournament must `acceptsPayments` | `:383-391`, `:59-78` | any email | |
| S4 | **Price**: World Cup → `WORLD_CUP_TEAM_FEE_CENTS` or `round(96000 / rosterSize)` with `rosterSize` **client-chosen 8–12**; otherwise `entry_fee_cents` → fallback `drop_in_fee_cents`; entry with `stripe_price_id` uses the Stripe Price | `:82-187`, `:455-469` | Client cannot set an amount. Client *can* choose the World Cup roster size (business rule: self-declared share; event is finished) | CONFIRMED safe |
| S5 | Registration lookup by **email** when no token: newest live row for that email (+tournament) | `:399-412` | email only | see F-01 |
| S6 | `persistRegistrationCheckoutDetails` writes `team_name`/`notes` **before payment** (World Cup kinds only) | `:237-280`, `:414-416` | email only | F-01 symptom |
| S7 | Contact upsert tag `paying` | `:418-423` | any email creates a contact | |
| S8 | `checkout.sessions.create({mode:'payment', customer_email, metadata{email, tournament_id, registration_id, drop_in_id, contact_id, pay_kind, team_name, roster_size}, success_url=/pay/success?session_id={CHECKOUT_SESSION_ID}, cancel_url=/pay?…})` | `:452-473` | metadata is server-set | |
| S9 | Stripe → `POST /api/stripe/webhook` `checkout.session.completed` | `webhook/route.ts:6-39` | **`constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`** `:14`; unset secret → `""` → verification throws → 400 (fail closed) | CONFIRMED |
| S10 | `recordCheckoutSessionPayment(session)` | `stripe-payments.ts:31-168` | see below | |
| S11 | Webhook responds `{received:true}` **200 regardless of outcome** | `:22-25, 38` | | F-02 |
| S12 | Browser lands on `/pay/success?session_id=` | `pay/success/page.tsx:49-54,171-204` | **Retrieves session from Stripe; requires `payment_status==='paid' && status==='complete'`** before calling the same recorder | CONFIRMED — redirect is not trusted |
| S13 | Admin fallback `POST /api/admin/sync-payments` | `sync-payments/route.ts:6-62` | lists **last 100 complete sessions**, `payment_status==='paid'`, same recorder | |

**`recordCheckoutSessionPayment` in detail** (`stripe-payments.ts`):
1. `email` from metadata or `customer_email`; missing → `skipped` (`:34-40`).
2. **Idempotency pre-check**: `payments where stripe_session_id = session.id` → `already_recorded` (`:53-61`).
3. `contact_id` from metadata else upsert by email (`:63-72`).
4. `registration_id` from metadata else **newest live registration by email (+tournament_id if present)** (`:74-92`).
5. **INSERT payments** `{…, status:'succeeded'}` (`:94-115`) — `stripe_session_id` UNIQUE and `stripe_payment_intent_id` partial-UNIQUE are **confirmed on the production database**, so a concurrent duplicate fails with 23505 and is returned as `error` (not `already_recorded`).
6. **UPDATE registrations set payment_status='paid'** (+ `team_name`, notes) (`:117-155`) — error logged, not returned.
7. UPDATE drop_ins (`:157-165`).

**Price trust — CONFIRMED safe.** No client field reaches `unit_amount`. `registrationId` is bound by HMAC; `tournamentId`/`dropInId` are UUID-checked and looked up. Quantity is fixed at 1.

**Webhook authenticity — CONFIRMED.** `webhook/route.ts:14`.

**Idempotency — CONFIRMED at the payment row, NOT for the side effects.** The database makes a second `payments` insert impossible. But step 6 is a separate statement: if it fails after step 5, every later delivery, the success page and sync-payments all return `already_recorded` at step 2 and **never retry step 6**. Nothing stores the Stripe *event* id; idempotency is keyed on the session id, which is correct for `checkout.session.completed` (one session, one completion).

**Success redirect — CONFIRMED not trusted** (S12). The page also renders "You're in!" with a yellow note when the internal record fails, which is honest.

**Authoritative payment state** is `registrations.payment_status` for every screen and gate; `payments` is the Stripe ledger. They are kept in sync **one way, once**: Stripe→app on completion. There is no handler for `charge.refunded`, `checkout.session.async_payment_succeeded/failed`, or `payment_intent.*`; the webhook is subscribed only to `checkout.session.completed` (docs/SESSION-LOG-2026-08-14-WAIVERS.md:204-205). `payment_status='refunded'` exists in the CHECK but is written only by the admin toggle. The admin "paid" toggle (`admin/registrations/[id]/route.ts:58-66`) writes `registrations` only, never `payments`, so **a cash payment leaves no ledger row** — which is precisely why the cancel rule has to ask `payments` rather than `payment_status` (`registration-cancel.ts:20-27`). Production: 16 registrations are `paid` with no succeeded payment row (cash/admin), 1 is `pending` with a succeeded payment row (F-02).

**Delayed payment methods (POSSIBLE):** `checkout.session.completed` fires for a session whose `payment_status` is `unpaid` when an asynchronous method (ACH debit, etc.) is enabled in the Stripe dashboard. The webhook marks the registration paid without checking `session.payment_status` (`webhook/route.ts:20-22` vs. success page `:178` and sync `:21`, which both check). Whether any async method is enabled is not visible from the repository (§15).

---

## 7. Waiver Timeline

| # | Step | Where | Identity binding | Evidence |
|---|---|---|---|---|
| W1 | Signing begins at A10c (DocuSeal, production) or A10b (in-app, when `DOCUSEAL_*` unset — never used in production: `waiver_signatures` has 0 rows) or admin "Sign now" (`admin/registrations/[id]/sign-waiver/route.ts:42-167`) | | submission created **server-side** with `metadata.registration_id` and the registration's email/name | |
| W2 | DocuSeal completion → `POST /api/docuseal/webhook` | `docuseal/webhook/route.ts:69-138` | **HMAC-SHA256 over `${timestamp}.${rawBody}` with `DOCUSEAL_WEBHOOK_SECRET`, ±300 s, timing-safe** (`app-signing.ts:121-140`); unset secret → 503; bad signature → 401 | CONFIRMED fail-closed. Whether the scheme matches what DocuSeal sends is **UNVERIFIED end-to-end** — the project log says no `form.completed` has been observed arriving since the URL fix (SESSION-LOG-2026-08-14-WAIVERS.md:224-226; `.env.example:9` names DocuSeal's "HMAC tab") |
| W3 | Association | `:99-103` | **`registrations where docuseal_submission_id = payload.data.submission.id` with `.single()`** — the incoming `metadata.registration_id` is declared in the type but **not used**; the id is trusted only as a lookup key | Good: a forged id can only hit a row that already references that submission. Bad: `.single()` errors when >1 row shares the id → 404, waiver not recorded (F-04) |
| W4 | Record | `recordSignedWaiver` `waiver-capture.ts:118-176` | one writer for all sources (webhook, sync, reconcile, admin override, in-app) | registration UPDATE first; contact UPDATE second, **failure logged only** (`:162-172`) |
| W5 | Player-side fallback: `/pay` and `/register` **poll DocuSeal** when the row says unsigned | `waiver-reconcile.ts:152-242`; `pay/page.tsx:157-161`; `register/page.tsx:97-104`; `payment-intent:118-125` | 6 s timeout; failure → treated as unsigned | correct: webhook is a notification, not the truth |
| W6 | Admin fallback `POST /api/admin/sync-waivers` | `sync-waivers/route.ts:6-134` | scans `sent` rows and `signed`-without-document rows | |
| W7 | Validity: `expires_at = signed_at + 365 days` at record time; `isContactWaiverValid` requires same `waiver_type` | `contacts.ts:28-55` | | annual validity exists and is enforced at signup (B4, A10a) and quick-join |
| W8 | Authority | contact for "may skip", registration for "this signup" (§3) | | |

**Replay/duplicate:** the webhook is idempotent by content — a second `form.completed` re-runs the same UPDATE with the same values; `recordInAppSignature` refuses a second row when `waiver_signed` is already true (`waiver/sign/route.ts:111-118`). CONFIRMED safe, except W3's `.single()` failure mode.

**Failure ordering**

| Sequence | Resulting state | Recovery |
|---|---|---|
| Waiver succeeds → DB write fails | DocuSeal complete; `waiver_signed=false`, `docuseal_status='sent'` | Self-healing: next `/pay` or `/register` visit polls DocuSeal (W5); admin sync (W6). SAFE |
| Payment succeeds → waiver incomplete | Cannot happen through the app: `payment-intent` and `/pay` refuse until signed (`payment-intent:127-136`, `pay/page.tsx:301-323`); checkout has no waiver check itself but `/pay` never renders `PayForm` unsigned. **Direct `POST /api/stripe/checkout` with `tournamentId`+email bypasses it** (POSSIBLE; production has 0 live paid-unsigned rows today) | admin roster shows ✗ |
| Waiver succeeds → payment abandoned | signed, `pending` row on the roster; counted in "still owes"; pay link valid 90 days | owner chases; player can self-cancel |
| Contact promotion fails after registration update | registration signed, contact stale → next event asks to sign again | log line only; no retry (P3) |

**Association risk (F-04):** the waiver-skip path copies `contact.waiver_submission_id` onto every new registration for that contact (`register/route.ts:248`, `pay-eligibility.ts:231,277`). Production: **19 submission ids are shared by 40 registration rows (max 3 per id)**. For those, W3's `.single()` returns PGRST116 and the webhook answers 404 for a legitimate completion. Today this only matters if DocuSeal re-sends a completion for an old submission, but it also means `docuseal_submission_id` is no longer a stable key for the row that was actually signed.

---

## 8. Failure Scenario Matrix

| Scenario | Code path | Resulting DB state | Safeguards | Verdict | Confidence |
|---|---|---|---|---|---|
| **A. Stripe payment succeeds, app DB update fails** | `stripe-payments.ts:94-155`; `webhook/route.ts:22-25,38` | (i) `payments` insert fails → no row; webhook still returns **200**, Stripe does not retry. Recovery: success page (if the player lands there), then admin `sync-payments` (last 100 sessions). (ii) `payments` row written, `registrations` update fails → **payment recorded, registration `pending` forever**: every retry returns `already_recorded` at `:59-61`. **Production has one such row** (Community Cup, 2026-08-22, $80 succeeded, `payment_status='pending'`, `payment_method='card'`, updated 2026-08-24). Staff can see it only by joining the two tables by hand; the Payments tab and Roster show it separately. | success page, sync-payments (window-limited), unique index | **UNSAFE** | CONFIRMED (ii); LIKELY (i) |
| **B. Registration created, Stripe abandoned** | A7/B6 then `cancel_url` | `pending` row remains on the roster indefinitely; pay token valid 90 days; row counts toward "signed up" and "still owes". No capacity concept exists, so nothing is *oversubscribed*; the team picker is not capacity-limited either. | self-cancel (`/api/registrations/[id]/cancel`), admin soft-delete | **SAFE** (by the business model: pay-later is intended) | CONFIRMED |
| **C. User pays and closes the browser** | S9–S11 | webhook records `payments` and flips the registration without the browser. Requires the Stripe endpoint to be configured on the `www` host (project log says it is and delivered 200s; not independently verifiable here). | webhook; sync-payments | **SAFE** | LIKELY |
| **D. Same webhook twice** | `stripe-payments.ts:53-61`; DB unique | second delivery → `already_recorded`; no second `payments` row (DB), no second registration update (skipped), no other side effects (invite email was removed). Concurrent duplicates → 23505 on insert → logged as `error`, still 200. | pre-check + `payments_stripe_session_id_key` + `payments_stripe_payment_intent_unique_idx` | **SAFE** for the ledger; the concurrent case leaves the registration update to the first delivery, which is correct | CONFIRMED |
| **E. Webhook arrives before/without the expected records** | `:74-92` | session metadata always carries `registration_id` when checkout came from a token; when it came from the `tournamentId` path with no registration, `registration_id=''` → falls back to newest live registration by email, else **orphan payment** (`registration_id` null). Production: 4 unlinked payments, 24 with no `tournament_id` (legacy). The registration row always exists before checkout on the token path, so ordering is not a race there. | metadata; email fallback | **SAFE** for ordering; **UNCLEAR** for attribution on the no-token path (orphans by design) | CONFIRMED |
| **F. Form submitted twice** | `RegistrationForm.tsx:213,466` (button disabled while submitting); `register/route.ts:183-192`; `join/route.ts:219-244` | second insert → **23505 from `registrations_one_live_spot_idx`** → 409 "already signed up". Contacts: `upsertContactByEmail` is read-then-insert with a unique email index → second concurrent insert fails and the route 500s (rare; the first request's row wins). Checkout: two sessions can be created (Stripe allows it); only one can be paid per registration because the token path refuses `payment_status='paid'` (`checkout:342-344`) — but two *unpaid* sessions both remain payable for 24 h (Stripe default) → **double charge possible if the player pays both tabs**; second completion flips an already-paid row and inserts a second `payments` row (different session id). No DocuSeal duplicate: one submission per registration. | DB unique index; UI disable | **SAFE** for registrations/rosters; **POSSIBLE** double charge across two open checkout tabs (no `client_reference_id`/idempotency key per registration) | CONFIRMED / POSSIBLE |
| **G. Two users claim the final slot** | none | **There is no slot.** No capacity column is checked on any signup path; `max_teams` is display-only (`events/[slug]/page.tsx:561`). Per-person uniqueness is atomic (unique index). | — | **NOT APPLICABLE** (no invariant to break) | CONFIRMED |
| **H. (found) Token minted from an email** | `pay/eligibility/route.ts:65-81` → `pay-eligibility.ts:544-564` | see F-01 | 30 req/min/IP in-memory | **UNSAFE** | CONFIRMED (code) |
| **I. (found) Cancel after payment** | `cancel/route.ts:86-105` | refused when a succeeded `payments` row exists by `registration_id` or `(contact_id, tournament_id)`; lookup failure → refused (fail closed) | tri-state lookup | **SAFE** | CONFIRMED |
| **J. (found) Refund issued in Stripe** | no handler | `payments.status` stays `succeeded`; `registrations.payment_status` stays `paid`; the player remains on the roster as paid and **cannot self-cancel** (I) | admin toggles by hand | **UNSAFE** (silent divergence) | CONFIRMED (absence of code) |

---

## 9. Database Invariant Matrix

All schema facts below were confirmed against the live database (`pg_constraint`, `pg_indexes`, `pg_policies`), not only the files.

| Invariant | DATABASE | APPLICATION | Verdict | Evidence |
|---|---|---|---|---|
| One live registration per person per event | `registrations_one_live_spot_idx` UNIQUE `(tournament_id, contact_id) WHERE cancelled_at IS NULL AND contact_id IS NOT NULL` | pre-checks in `join:103-115`, roster POST `:345-357`; 23505 mapped to 409 | **BOTH** | `supabase/migrations/20260815001500_dedupe_registrations_and_guard.sql:85-87` |
| …when `contact_id` is NULL | not covered (2 rows in prod have null contact) | `/api/register` always sets `contact_id` | APP only for legacy rows | |
| Player cannot appear twice on a roster | same as above (roster = registrations) | | BOTH | |
| Payment references an existing registration | FK `payments.registration_id → registrations ON DELETE SET NULL` (nullable) | metadata/email resolution | BOTH (nullable by design) | `supabase/payments.sql:9` |
| Registration references an existing event | FK `tournament_id → tournaments ON DELETE SET NULL` (**nullable**; 37 prod rows null) | `resolveTournament` may return null | BOTH, weak | `20260513120600:8-10` — the promised NOT NULL never landed |
| Team cannot exceed capacity | none | none | **NEITHER** | `max_teams` display-only |
| Event cannot exceed registration capacity | none | none | **NEITHER** (no capacity concept) | |
| One Stripe session processed once | `payments_stripe_session_id_key` UNIQUE; `payments_stripe_payment_intent_unique_idx` | pre-check `:53-61` | **BOTH** | confirmed live |
| One successful payment → at most one roster entry | registration exists before payment; unique index above | | BOTH | |
| Registration flips to paid when payment recorded | none (no trigger) | second statement, not retried | **APP, non-atomic** | F-02 |
| `payment_status` ∈ allowed set | CHECK | whitelist in admin PATCH | BOTH | |
| `payment_method` ∈ {card, cash} | **none** (free text) | `isPaymentMethodChoice` | APP | |
| Team belongs to the registration's tournament | none (no composite FK) | `resolveTeamIdForTournament`; admin PATCH check `:113-147`; roster POST `:291-304` | APP (3 places, consistent) | |
| Completed match has both scores | `matches_completed_has_scores` CHECK | RPC only | BOTH | `20260908120100:38-40` |
| Scorer belongs to a team in the match | `save_match_result` raises | route validation | BOTH | live function body |
| Result save is atomic (scores + scorers) | single plpgsql function, `FOR UPDATE` | | DATABASE | confirmed |
| Team name unique per tournament | `teams_tournament_name_unique_idx (tournament_id, lower(name))` | | DATABASE | |
| Contact email unique | `contacts_email_unique_idx` (citext) | `upsertContactByEmail` | BOTH | |
| Contact phone unique (D4 target) | **none** (non-unique partial index; 0 duplicates today) | walk-in reuses by phone | APP | |
| Waiver record survives registration deletion | **No**: `waiver_signatures.registration_id ON DELETE CASCADE` | app never hard-deletes registrations (admin DELETE is soft since 2026-08-17) | APP policy only | `20260812210000:22` |
| Waiver valid → `waiver_expires_at` present | none | computed at record time | APP | |
| `registration_type` ∈ {adult, youth} | prod CHECK allows **`team`, `adult`, `youth`, `freeagent`**; repo baseline says adult/youth only | validated | BOTH, **drifted** | live `registrations_registration_type_check` vs `20260319215600` |
| Draft event not publicly readable | RLS `is_draft = false` on `tournaments`; but `tournament_rounds`, `tournament_updates`, `matches`, `match_scorers` are `using (true)` | app filters | DATABASE for the row; **NEITHER** for its children via PostgREST | live `pg_policies` |
| RLS deny-by-default for PII tables | `contacts`, `registrations`, `payments`, `drop_ins`, `teams`, `team_members`, `waiver_signatures`: RLS on, **0 policies** | all access via service role | DATABASE | confirmed; Supabase advisor flags as INFO |

**Multi-write business operations that are not atomic** (and whether it matters):

| Operation | Writes | Invariant at risk | Matters? |
|---|---|---|---|
| Record payment | payments INSERT → registrations UPDATE (→ drop_ins) | "paid in Stripe ⇒ paid on roster" | **Yes** (F-02, one live case) |
| Register (form) | contacts upsert → registrations INSERT → link UPDATE → waiver-skip UPDATE → contact patch → DocuSeal POST → registrations UPDATE | partial: row exists with no sign link (A10c failure) | Moderate: recoverable via reconcile/admin; the player sees a 500 |
| Record signed waiver | registrations UPDATE → contacts UPDATE | "returning player never re-signs" | Low: next signup re-asks; documented |
| In-app signature | waiver_signatures INSERT → recordSignedWaiver | signature without a signed row | Low: deliberate ordering, visible to admin |
| Admin paid toggle | registrations UPDATE only | ledger completeness | Moderate: cash never enters `payments` (observability, F-07) |

**Migration ledger vs. files (F-06):** the production `supabase_migrations.schema_migrations` lists 22 versions; the repo has 30 files. Eight repo migrations (`…121100`, `…121200`, `…124500`, `…150000`, `…170000`, `…203000`, `…120000` (06-03), `…120100` (09-08)) have no ledger entry although their objects exist; six ledger versions differ from the file names (e.g. `20260619201109` vs `20260619140000_create_matches_and_scorers`). `tournaments`, `payments`, `site_settings`, `tournament_updates` and both storage buckets are defined only in undated loose files under `supabase/`, and 14 migration files reference them. A fresh `supabase db push` cannot reproduce production. FOLLOWUPS.md:460-464 records the cause (MCP-applied migrations stamp their own version).

---

## 10. Authentication & Authorization Assessment

**Authentication (who are you)**

| Principal | Mechanism | Assessment |
|---|---|---|
| Player | Supabase Auth, Google OAuth only; session validated server-side with `auth.getUser()` (never `getSession()`), `player-auth.ts:34-52`; PKCE callback sanitises `next` (`auth/callback/route.ts:62-66`) | Correct. Contact is matched **by email** and lazily created (`:81-122`); no `auth_user_id` column exists, so identity = verified Google email. |
| Admin | Single `ADMIN_USER`/`ADMIN_PASSWORD` from env; SHA-256 + `timingSafeEqual` compare (`login/route.ts:5-9,28-29`); HMAC cookie `admin_token`, httpOnly, secure in prod, SameSite=Lax, **30 days** (`admin-session.ts:15,30`); auto-renewed after 15 days | Sound primitives. **No rate limit, lockout or delay on `/api/admin/login`** (F-05). D2 (owner-changeable password) not implemented: `site_settings` has 1 row in production. |
| Record holder (signed-out player) | Pay-resume token: HMAC over `{rid, exp}`, 90 days, timing-safe (`app-signing.ts:80-119`) | Correct construction. **Minted from an email alone** by `/api/pay/eligibility` (F-01). |
| Stripe / DocuSeal | signature verification, fail-closed on missing secret | Correct. |

**Authorization (what may you do)** — server-side, before any privileged call:

| Action | Enforcement | Verdict |
|---|---|---|
| View private player info (`/me`, `/api/me/*`) | middleware redirect for `/me/*` **and** page/route re-check via `getCurrentPlayer` | correct (defence in depth) |
| Modify own info (`PATCH /api/me/profile`) | session; whitelist of fields; writes own contact by email | correct; returns `contacts.*` including admin `notes` (P3) |
| Modify another user's info | no route allows it by session. **By token:** cancel, payment-method, youth waiver signature, read email/first name — token obtainable by email (F-01) | **flaw** |
| Team self-assignment | `/api/register/join` session-bound; first assignment only; team bound to event | correct |
| Roster management, score entry, event admin, payment admin, waiver override/sync | `verifyAdmin()` is the **first statement of every handler in all 37 admin route files** (verified by sweep, e.g. `roster/route.ts:84,256`, `result/route.ts:78,121`, `override-waiver:18`) | correct |
| Admin pages | gated client-side by `AdminGate` → `/api/admin/me`; every `/admin/**/page.tsx` is `"use client"` and fetches from gated APIs; the server layout renders no data | acceptable: no data is rendered before the check (the shell is public HTML) |
| Waiver access | `/waiver/[id]` capability URL (UUID, noindex); `GET /api/registrations/[id]?token=` | acceptable by design; unauthenticated, unrated |
| Middleware | does **not** enforce admin; does not gate `/register`, `/pay` (deliberate, documented) | fine |

**Frontend-only authorization:** none found. Every hidden button has a server check behind it.

**Service-role usage.** Every sensitive operation runs through `supabaseAdmin`. The protection *before* the privileged call is, per route: admin cookie (37 admin files), Supabase session (`join`, `me/*`, `cancel` alt-path), pay token (`payment-intent`, `waiver/sign`, `registrations/[id]`, `cancel`, `checkout` token path), webhook signature (both webhooks), or **nothing** (`/api/register`, `/api/pay/eligibility`, `/api/pay/options`, `/api/stripe/checkout` non-token path, `/pay/success` with a Stripe-verified session id, `/api/analytics`). The "nothing" set is where every application-level finding lives. One ordering nit: `cancel/route.ts:38-53` reads the registration before the auth check, so 404-vs-403 reveals whether a UUID exists (P3).

**RLS.** Enabled on all 13 tables. Public SELECT policies exist only for tournaments (`is_draft = false`), tournament_rounds, tournament_updates, matches, match_scorers (with `contact_id` column revoked from anon/authenticated), site_settings, and the `tournament-images` storage bucket. No INSERT/UPDATE/DELETE policy exists anywhere; anon/authenticated cannot read contacts, registrations, payments, drop_ins, teams, team_members or waiver_signatures. **Correct for this architecture.** Gap: children of a draft event are readable via PostgREST with the anon key (P3). Supabase security advisors: 7× "RLS enabled, no policy" (INFO — intended), 11× mutable `search_path` on functions (WARN; the three business functions run only as service_role), `citext` in public schema, leaked-password protection off (irrelevant — no password sign-in).

---

## 11. Secrets / Trust-Boundary Assessment

No secret values are reproduced here.

| Check | Result |
|---|---|
| Stripe secret / webhook secret via `NEXT_PUBLIC_*` | **No.** `STRIPE_SECRET_KEY` read only in `src/lib/stripe.ts:4`; `STRIPE_WEBHOOK_SECRET` only in `webhook/route.ts:9`. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` appears in `.env.example:17` and is **unused** by code (Checkout is hosted). |
| Service-role key via `NEXT_PUBLIC_*` | **No.** `SUPABASE_SERVICE_ROLE_KEY` only in `supabase-admin.ts:9` and the admin diagnostics presence check. |
| DocuSeal secrets client-side | **No.** `DOCUSEAL_*` read only in server modules. |
| Admin credentials in browser code | **No.** |
| `"use client"` importing secret-bearing modules | One value import: `src/app/admin/site/page.tsx:15-22` imports constants from `src/lib/site-settings.ts`, whose line 2 imports `supabase-admin`. The key is not leaked (not `NEXT_PUBLIC_`; lazy Proxy), but `@supabase/supabase-js` is bundled client-side and **no `server-only` guard exists anywhere in `src/`** (P3; a future edit could leak). All other client imports of `stripe`/`supabase-admin`/`app-signing` are `import type`. |
| Secrets committed to the repo or history | **None found.** `git grep` and a history search for `sk_live_`, `sk_test_`, `whsec_`, JWT prefixes match only the `.env.example` placeholders. `.env*` is gitignored (`.gitignore:32-34`). |
| Signing secret fail-open | Production throws if `APP_SIGNING_SECRET`/`ADMIN_SESSION_SECRET` unset (`app-signing.ts:27-29`) — fail closed. Non-production derives a key from `ADMIN_USER`/`ADMIN_PASSWORD`, which is a **public constant** if those are also unset (`:30-34`) — dev only; Vercel builds run `NODE_ENV=production`. |
| Known prior exposure | **`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` and `POSTGRES_PASSWORD` were reachable behind a public preview URL from 2026-06-19 to 2026-08-14** (FOLLOWUPS.md:142-146; docs/SESSION-LOG-2026-08-14.md:225-226). The exposure was closed; **rotation was "deliberately deferred" and no later document records it happening.** Secret appears to have been exposed at that location. **Rotation recommended** (F-00). |
| Sensitive data returned to the browser unnecessarily | `PATCH /api/me/profile` returns the whole contact row incl. admin `notes`; `/waiver/[id]` renders signer IP and User-Agent to anyone with the UUID; `GET /api/registrations/[id]?token=` returns email + first name (needed by PayForm). Admin routes return full PII to the admin only. Public open-play attendee list is truncated to first name + initial **in SQL** (`open_play_attendees`). Acceptable. |
| Logs | `console.error` lines include Supabase error messages and Stripe error objects; no card data, no tokens. The DocuSeal webhook logs the submission id only. Vercel Hobby retains ~1 h (FOLLOWUPS.md:152-153); the 24 h production log query returned nothing. |
| HTTP headers (live) | HSTS 2 years (Vercel), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; no CSP (Stage 2). |

---

## 12. Root Causes

1. **Email is the identity on every unauthenticated route, and a capability token is derived from it.** `contacts.email` is the join key for players (`player-auth.ts:81-85`), registrations (`stripe-payments.ts:80-92`, `checkout:399-412`), and eligibility (`pay-eligibility.ts:429-446`), and `/api/pay/eligibility` converts "I typed this email" into a 90-day signed token. Produces F-01 and the weaker checkout/register write symptoms.
2. **Payment truth lives in two tables with a one-shot, one-way sync and no reconciliation loop.** `payments` (Stripe) and `registrations.payment_status` (what everyone reads) are written by different statements; the idempotency guard protects the ledger but suppresses retries of the flip; the webhook acknowledges failures; refunds and async payments have no handler; cash never enters the ledger. Produces F-02 and F-07.
3. **Event state exists in two vocabularies.** Derived state (`tournament-state.ts`) guards money and signup; stored `status`/`registration_open`/`payments_open` still feed display, sorting and badges; nothing ever writes `completed`. Produces F-03.
4. **Waiver identity was copied instead of referenced.** Registration rows duplicate the contact's waiver columns (including `docuseal_submission_id`), so the DocuSeal lookup key is non-unique and the "waiver on file" fact can be inherited by anyone who supplies the email. Produces F-04.
5. **The schema evolved outside the migration ledger.** Loose SQL, dashboard/MCP-applied migrations with mismatched versions, hand-applied constraint changes. Produces F-06 and the deploy-order traps in `CLAUDE.md`.
6. **Single-operator admin auth was built for one person and never hardened.** Static env credentials, no throttling, 30-day cookie, D2 unbuilt. Produces F-05.
7. **Observability was budgeted for a 1-hour log window.** Errors are logged and forgotten; there is no persisted webhook/event record and no "Stripe charged this person, why aren't they registered?" query surface. Produces F-07.
8. **Operational secrets exposure was triaged as "later".** Produces F-00.

---

## 13. P0/P1/P2 Issue Register

### [F-00] Exposed Supabase service-role key, JWT secret and Postgres password never rotated
**Severity:** P0 · **Confidence:** LIKELY · **Area:** secrets / infrastructure
**Business invariant affected:** only the application may read or write the database.
**Observed implementation:** the project's own logs state these three values were reachable behind a public Vercel preview URL from 2026-06-19 to 2026-08-14, that the exposure was closed, and that rotation was deliberately deferred. No subsequent document, commit or follow-up records a rotation. The service-role key bypasses RLS on every table (`supabase-admin.ts:19-24`); the JWT secret can mint any Supabase session; the Postgres password is direct database access.
**Evidence:** `FOLLOWUPS.md:142-146`; `docs/SESSION-LOG-2026-08-14.md:225-226`; `docs/SESSION-LOG-2026-08-14-WAIVERS.md:231-232`; no later mention (grep `rotat` across `docs/` and `FOLLOWUPS.md`).
**Failure mode:** anyone who captured the values during the eight-week window has silent full read/write access to contacts (names, phones, DOBs, minors' DOBs, emergency contacts), registrations and payments.
**Impact:** unauthorized privileged data access; regulatory exposure (minors' data).
**Root cause:** #8.
**Direction:** rotate all three per `docs/AUTH-RUNBOOK.md:104-131` outside a match night; since every page reads the service-role key, sequence Vercel env update + redeploy before revoking the old key. Verify the audit log in Supabase afterwards. If rotation did happen and was simply not recorded, downgrade to closed and record it.

### [F-01] A pay-resume token, the app's only record-level capability, is minted from an email address alone
**Severity:** P1 · **Confidence:** CONFIRMED (code; not exercised against production)
**Area:** authorization · **Invariant:** only the registrant (or the admin) may cancel, alter, or sign on behalf of a registration.
**Observed implementation:** `POST /api/pay/eligibility` accepts `{email, tournamentId, waiverType}` with no authentication and, when a live pending registration exists for that email on that event, returns `registrationId` and a fresh **`payToken`**. Tournament ids are public (`GET /api/pay/options`; every event page). The token then satisfies: `POST /api/registrations/[id]/cancel` (`:66`), `POST /api/register/payment-intent` (`:45`), `GET /api/registrations/[id]` (`:16`, returns email + first name), `POST /api/waiver/sign` (`:55`; youth waivers have no name check `:123`), and the checkout token path. The only guard is an in-memory 30/min/IP counter that resets per serverless instance. The route also answers `unknown_email` vs. anything else, enumerating registrants. Related email-only writes: `POST /api/stripe/checkout` with `tournamentId`+`email`+World-Cup fields updates `team_name`/`notes` on the newest live registration for that email before any payment (`checkout:399-416,237-280`); `POST /api/register` with a returning player's email creates a registration that inherits that player's signed waiver and returns its token (`register/route.ts:234-295`).
**Evidence:** `src/app/api/pay/eligibility/route.ts:23-82`; `src/lib/pay-eligibility.ts:528-565`; `src/lib/pay-eligibility-rate-limit.ts:1-27`; `src/app/api/registrations/[id]/cancel/route.ts:65-84`; `src/app/api/waiver/sign/route.ts:55,123-133`.
**Failure mode:** a caller who knows a player's email (a teammate, a WhatsApp group) cancels that player's unpaid Community Cup spot, or declares "cash" for them, or signs a youth waiver in a parent's stead.
**Impact:** roster tampering; a signature recorded under the wrong hand; PII disclosure per email.
**Root cause:** #1.
**Direction:** the eligibility route should never return a token. Return status only; deliver tokens exclusively through channels that prove control of the email or session (the registration response itself, the signed-in `/register` page, a link the owner sends). Bind youth waiver signatures to the registration's parent/guardian name or to a session. Consider a persistent rate limit (Upstash/DB) on all email-keyed public routes, and make `unknown_email` indistinguishable from `needs_registration`.

### [F-02] Payment truth and registration truth can diverge silently, and nothing repairs it
**Severity:** P1 · **Confidence:** CONFIRMED (one live production instance)
**Area:** payments / data integrity · **Invariant:** a succeeded Stripe payment for a registration ⇒ `registrations.payment_status='paid'`, and a refund ⇒ not paid.
**Observed implementation:** (a) `recordCheckoutSessionPayment` inserts `payments` then updates `registrations` as a second statement whose error is only logged (`stripe-payments.ts:117-155`); (b) the pre-check returns `already_recorded` whenever the `payments` row exists (`:53-61`), so the webhook retry, the success page and `sync-payments` all skip the registration update forever; (c) the webhook returns 200 on `outcome.status === "error"` (`webhook/route.ts:22-25,38`), so Stripe never retries a failed insert; (d) the webhook marks paid on `checkout.session.completed` without checking `session.payment_status` (`:20-22`), unlike the success page (`:178`) and sync (`:21`); (e) no handler exists for refunds or async payment outcomes, and `payment_status='refunded'` is written only by hand. **Production:** one Community Cup registration (created 2026-08-22 01:33:00Z) has a succeeded $80 payment linked by `registration_id` recorded 36 s later, yet `payment_status='pending'`, `payment_method='card'`, last updated 2026-08-24. The Aug-14 audit found zero such rows; this one arose after.
**Evidence:** `src/lib/stripe-payments.ts:53-61,94-155`; `src/app/api/stripe/webhook/route.ts:6-39`; `src/app/api/admin/sync-payments/route.ts:11-14,28-31`; production query `registrations ⋈ payments(status='succeeded') where payment_status<>'paid'` → 1 row.
**Failure mode:** player paid, roster says "still owes"; owner asks for $80 at the field; player cannot see why; `/register` offers "Pay $80 now" again → possible second charge.
**Impact:** financial correctness and trust; manual reconciliation only by joining two tables.
**Root cause:** #2.
**Direction:** make "record payment" a single database operation (an RPC or a trigger on `payments` insert that flips the registration), and make the recorder converge on the *end state* rather than on "row exists" (re-apply the registration update when the payment row exists and the registration disagrees). Return 5xx from the webhook when persistence fails so Stripe retries. Check `payment_status==='paid'` in the webhook or subscribe to `checkout.session.async_payment_succeeded`. Add `charge.refunded` handling that writes `payments.status='refunded'` and `registrations.payment_status='refunded'`. Store the Stripe event id with each write for audit.

### [F-03] Public surfaces read stored event flags; the backend reads derived state
**Severity:** P2 · **Confidence:** CONFIRMED (code + production row)
**Area:** event lifecycle / source of truth · **Invariant:** every surface agrees whether an event is finished, open for sign-up, or open for payment.
**Observed implementation:** see §4. The production row `open-play-july-27-28-2026` (held 2026-08-14) is stored `ongoing / registration_open / payments_open`. Live HTML on 2026-09-09: `/events` prints `Ongoing — Registration &amp; Payments Open` and `<a class="btn-primary …" href="/register?tournament=open-play-july-27-28-2026">Sign up to play</a>`; `/events/open-play-july-27-28-2026` renders `…animate-pulse"></span>Ongoing</span>…>Registration Open</span>…>Payments Open</span>` in the header and `<h3 …>Past event</h3><p …>This event has ended…` in the CTA card of the same document, plus the D7 free-entry offer; the homepage archive card for the same event says `Completed`. Community Cup, two rounds into its season, carries the `Upcoming` pill on three surfaces. `/register` and every money path correctly say closed. `PATCH /api/admin/tournaments/[id]` still accepts `status`, `registration_open`, `payments_open` independently (`:46-52`), so the form's single dropdown is not the only writer.
**Evidence:** `src/app/events/page.tsx:8-24`; `src/components/shared/TournamentCard.tsx:18-31,57-68,128-140`; `src/lib/tournament-public-links.ts:55-73`; `src/app/events/[slug]/page.tsx:370,619-641` vs `:392-398`; `src/app/page.tsx:29-34,56-60,171,343`; `src/lib/tournament-state.ts:133-145` (never returns `completed`).
**Failure mode:** a finished event advertises open registration; the button leads to a "closed" card. The next open-play night will do the same the morning after it ends unless the owner edits it.
**Impact:** operator credibility; support messages; no money risk (gates hold).
**Root cause:** #3.
**Direction:** one accessor. Every presentational reader should consume `resolveTournament()` (`effectiveState`, `effectiveStatus`, `canRegister`, `canPay`) and never the raw columns; sort `/events` by effective state; have the admin PATCH derive the three columns from one `state` field exactly as the form does. Longer term (Track B), store `state ∈ {draft, open, closed}` only, as D1 already decided.

### [F-04] Waiver evidence is copied onto registrations, so the DocuSeal key is non-unique and the "on file" fact is inheritable
**Severity:** P2 · **Confidence:** CONFIRMED (structure) / POSSIBLE (harm)
**Area:** waiver integrity · **Invariant:** each signed document maps to exactly one signing event and one person; only that person can rely on it.
**Observed implementation:** the waiver-skip paths copy `contact.waiver_submission_id` into `registrations.docuseal_submission_id` (`register/route.ts:248`; `pay-eligibility.ts:231,277`). The DocuSeal webhook resolves `registrations … .eq("docuseal_submission_id", id).single()` (`docuseal/webhook/route.ts:99-103`); with >1 row `.single()` errors and the completion is answered 404. Production: 19 submission ids are shared by 40 rows. Separately, `POST /api/register` needs only an email to create a registration marked `waiver_signed=true` from the contact's waiver (A10a), with whatever name/DOB the caller typed on the registration row; `upsertContactByEmail` does not overwrite the contact, so the two rows can disagree on who the person is. `waiver_signatures` (in-app) has never been used in production (0 rows) and cascades on registration delete.
**Evidence:** above; live count query on `docuseal_submission_id`; `supabase/migrations/20260812210000_create_waiver_signatures.sql:22`.
**Failure mode:** a legitimate DocuSeal completion or re-send for a shared submission is dropped (recoverable only by polling); a person plays under another person's waiver by typing their email.
**Impact:** legal-evidence integrity; the exact "no document to produce" exposure REBUILD-PLAN §2 describes.
**Root cause:** #4.
**Direction:** reference, don't copy: registrations should point at a waiver record (contact-level, or a `waiver_signatures`/`waivers` row) rather than duplicating its columns; the webhook should resolve by `metadata.registration_id` (server-set at creation, `register/route.ts:337-341`) with the submission id as a cross-check; use `maybeSingle` + explicit ambiguity handling meanwhile. Gate waiver inheritance on proof of email control or session.

### [F-05] Admin login has no brute-force protection on a single static credential
**Severity:** P2 · **Confidence:** CONFIRMED
**Area:** authentication · **Invariant:** only the owner can obtain an admin session.
**Observed implementation:** `POST /api/admin/login` compares `ADMIN_USER`/`ADMIN_PASSWORD` (timing-safe) and issues a 30-day HMAC cookie; there is no per-IP or per-account throttle, lockout, or delay; the only limiter in the codebase is the in-memory one on pay-eligibility. D2 (owner-changeable password from the admin UI) is not implemented; the password lives in Vercel env. `verifyAdmin` has a dead misconfiguration branch (`admin-auth.ts:24` looks for `ADMIN_SESSION_SECRET` in a message that says `APP_SIGNING_SECRET`) — still fail-closed.
**Evidence:** `src/app/api/admin/login/route.ts:11-58`; `src/lib/admin-session.ts:15,20-32`; `src/lib/admin-auth.ts:6-31`.
**Failure mode:** online guessing of one password protects every roster, payment record, waiver override and contact export.
**Impact:** full admin compromise = all PII + ability to mark anyone paid/signed.
**Root cause:** #6.
**Direction:** persistent rate limiting and exponential backoff keyed by IP and username; shorten cookie life or add re-auth for destructive routes; move the credential to a hashed value in `site_settings` (D2) with a change flow; fix the dead branch.

### [F-06] The schema cannot be reproduced from the migration ledger
**Severity:** P2 · **Confidence:** CONFIRMED
**Area:** database / deploy safety · **Invariant:** migrations applied in order on an empty database yield production's schema; the ledger says what is applied.
**Observed implementation:** five tables and both storage buckets exist only in undated loose `.sql` files; 14 migration files depend on them; the production ledger has 22 entries vs 30 files with six mismatched versions and eight missing; the live `registrations_registration_type_check` still permits `team`/`freeagent` while the repo baseline permits `adult`/`youth` only; `registrations.tournament_id` and `contact_id` are nullable although the linking migration's comment promised NOT NULL (37 and 2 null rows respectively).
**Evidence:** `supabase/tournaments.sql`, `supabase/payments.sql`, `supabase/site-settings.sql`, `supabase/tournaments-featured-and-updates.sql`; `supabase/migrations/20260513120600_alter_registrations_links.sql:2-3`; live `supabase_migrations` listing; `FOLLOWUPS.md:460-464`; `CLAUDE.md` "two FKs" and "migration first, then deploy" sections.
**Failure mode:** a future migration is applied twice or not at all; a constraint rename `drop … if exists` silently no-ops (as the waiver-source migration's own comment warns); the next "add a column" deploy 42703s the public site again.
**Impact:** every schema change is a hand-coordinated risk on a live season.
**Root cause:** #5.
**Direction:** capture production's actual DDL as a single baseline migration, retire the loose files, repair the ledger to match file versions, and adopt one apply path (CLI `db push` or MCP, not both). Add the NOT NULLs and the narrowed CHECK once the 37 orphan rows are resolved (Track B1).

### [F-07] There is not enough persisted information to answer "Stripe charged this person — why aren't they registered?"
**Severity:** P2 · **Confidence:** CONFIRMED
**Area:** observability / reconciliation · **Invariant:** every money event is traceable to its effect.
**Observed implementation:** the webhook stores no Stripe event id and no receipt/attempt log; failures go to `console.error` on a platform retaining ~1 hour; `sync-payments` looks back only 100 sessions; cash payments marked by the admin toggle never create a `payments` row, so 16 `paid` registrations have no ledger entry and are indistinguishable from a lost webhook; 24 of 60 payments have no `tournament_id` and 4 link to nothing; the admin dashboard has no "mismatch" view (the one live F-02 row is invisible except by SQL). Contact promotion failures and post-insert link failures are `console.warn` only.
**Evidence:** `src/app/api/stripe/webhook/route.ts:22-25`; `src/lib/stripe-payments.ts:112-115,152-154,162-164`; `src/app/api/admin/sync-payments/route.ts:11-14`; `src/app/api/admin/registrations/[id]/route.ts:58-66,149-155`; `FOLLOWUPS.md:152-153`; production aggregates above.
**Failure mode:** the owner learns of a lost payment from the player, weeks later, with no trail.
**Impact:** reconciliation cost; refunds issued blind.
**Root cause:** #7 (and #2).
**Direction:** a `payment_events`/`webhook_receipts` table keyed by Stripe event id (status, error, registration id); write a `payments` row (source `cash`/`admin`) when the admin marks paid; a dashboard query for "succeeded payment ⋈ registration not paid" and "paid registration with no ledger row"; widen `sync-payments` with a `created[gte]` window.

### [F-08] Two open checkout sessions can both be paid for one registration
**Severity:** P2 · **Confidence:** POSSIBLE
**Area:** payments · **Invariant:** one registration is charged at most once.
**Observed implementation:** each POST to `/api/stripe/checkout` creates a new Checkout Session; sessions stay payable for 24 h; the guard against a second charge is the `payment_status==='paid'` check at *session creation* (`checkout:342-344`), not at completion. Two tabs opened before either pays both complete; the second completion inserts a second `payments` row (different session id) and re-flips the row. No `client_reference_id`, no per-registration idempotency key, no expiry of the earlier session.
**Evidence:** `src/app/api/stripe/checkout/route.ts:342-344,452-473`; `src/lib/stripe-payments.ts:53-61` (keyed by session, not registration).
**Failure mode / impact:** double charge → refund → F-02's refund gap.
**Root cause:** #2.
**Direction:** store the open session id on the registration and reuse/expire it; or reject recording a second succeeded payment for an already-paid registration and auto-refund.

*P3 items observed and deliberately not registered:* draft-event children readable via anon PostgREST; `cancel` route reads before auth (existence oracle); `/api/me/profile` returns admin `notes`; `/waiver/[id]` exposes IP/UA to UUID holders; no `server-only` guard; dead `verifyAdmin` branch; `team_members` and `drop_ins` admin UI on empty tables; `types.ts` `waiver_source` union omits `in_app`; mutable `search_path` on SQL functions; contact-promotion failures unlogged beyond `console.warn`; 3 live registrations created after their event ended (legacy data).

---

## 14. Stage 1 Remediation Order

1. **Credential containment** — rotate the three exposed Supabase secrets (F-00); confirm and record it. Independent of everything else; do it between match nights.
2. **Stop minting capabilities from email** — remove `payToken` from the eligibility response, bind youth signing (F-01). Small, no schema change, closes the only authorization flaw.
3. **Payment invariants** — atomic record-payment (RPC/trigger), converge-on-end-state recorder, 5xx on failure, `payment_status` check, refund handler, per-registration session reuse (F-02, F-08). Fix the one live mismatched row by hand first.
4. **Authoritative event model** — one accessor for every public reader; admin PATCH derives the three columns from one state (F-03). Then Track B's `state` column.
5. **Schema and ledger** — baseline migration from production DDL, retire loose SQL, repair ledger, add the missing NOT NULLs/CHECK after Track B1 cleanup (F-06). Do this *before* the roster-table migration (B3), or B3 inherits the same trap.
6. **Waiver lifecycle** — reference waivers instead of copying; webhook resolves by `registration_id`; inheritance gated on proof (F-04). Fits naturally into B3/B4.
7. **Admin auth hardening + D2** (F-05).
8. **Observability/reconciliation** — event receipts, cash ledger rows, mismatch view (F-07). Cheap, and it makes 3 verifiable.

Order rationale: 1 and 2 are containment with no dependencies; 3 is the highest-value correctness fix and needs no new tables; 4 is display-only and safe any time; 5 must precede 6 because 6 is a schema change; 8 last only because it is diagnostic rather than corrective, but it can be pulled forward cheaply.

---

## 15. Unknowns

| Unknown | Why it could not be determined | Evidence that would resolve it |
|---|---|---|
| Whether the exposed service-role key / JWT secret / Postgres password were rotated after 2026-08-14 | No document records it; rotation state is not visible via the Supabase MCP tools used here | Supabase dashboard → Settings → API "key generated" date, or a note from the owner |
| Whether DocuSeal's live webhook signature scheme matches `verifyDocusealWebhookSignature` (`timestamp.signature` HMAC) | No `form.completed` has been observed arriving since the URL fix (project log); DocuSeal's console is not reachable from here | One DocuSeal Events Log entry with a 200 from `www…/api/docuseal/webhook`, or a captured header |
| Whether any asynchronous Stripe payment method (ACH, bank transfer) is enabled | Stripe dashboard not accessible; the code's `payment_method_types` is unset (automatic) | Stripe Dashboard → Payment methods; or a session with `payment_status='unpaid'` at completion in Stripe logs |
| Whether the Stripe webhook endpoint is still on the `www` host and 100% healthy | Only the 2026-08-14 log asserts it | Stripe Dashboard → Webhooks endpoint delivery log |
| Whether the single F-02 production row was a failed second write or an admin edit on 2026-08-24 | Vercel logs retain ~1 h; no audit table | Admin recollection; the fix is the same either way |
| The 3 live registrations created after their event ended and the 37 with no tournament | Legacy data predating the FK backfill | Track B1 cleanup decision by the owner |
| Whether Google sign-in currently completes on the real domain | Cannot run a browser session here; 15 `google` identities exist, so it has worked at least 15 times | Any `auth.sessions` row newer than the last deploy |
| Vercel env-var names in production (e.g. `APP_SIGNING_SECRET` vs legacy alias) | Not read (values are secret; names weren't enumerated to avoid touching deployment config) | `vercel env ls` by the owner |
| Whether the apex host `houstonpremiersoccer.com` still 307s to `www` at the Vercel edge (the middleware deliberately lets the apex through, `src/lib/canonical-host.ts`) | The Vercel fetch tool refused the apex host; direct egress is blocked here. The `.vercel.app` alias was confirmed to 308 to `www`. | `curl -sI https://houstonpremiersoccer.com/` from any machine; matters because `og:url` in `src/app/layout.tsx:43` still names the apex and a third-party webhook pointed at the apex dies silently (CLAUDE.md) |

---

*Local verification performed:* `npm ci`, `npx tsc --noEmit` (clean), and all 11 `scripts/test-*.ts` (179/179 assertions pass). `npm run build` was not run in this sandbox (no `.env.local`; the build does not need it but was judged unnecessary for a read-only audit).
