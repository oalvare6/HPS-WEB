# FOLLOWUPS

Append-only log of issues discovered during the HPS admin and registration overhaul
that are out of scope for the current phase. One line per item.

Format:

```
- [phase N] <issue> — discovered YYYY-MM-DD
```

## Items

<!-- Append new items below this line. -->
- [phase 8] registration analytics POST to `/api/analytics` logs JSON lines only (no DB table); add persistence or Vercel log drain query when ops wants dashboards — discovered 2026-05-21
- [phase 0] reconciled loose `supabase/registrations.sql` into `supabase/migrations/20260319215600_create_registrations.sql` — discovered 2026-05-21
- [phase 0] reconciled loose `supabase/add-docuseal-columns.sql` into `supabase/migrations/20260319224900_add_docuseal_columns_to_registrations.sql` — discovered 2026-05-21
- [phase 0] deleted `supabase/APPLY_ALL_MIGRATIONS.sql`; redundant paste-bundle of already-applied migrations in `supabase/migrations/` — discovered 2026-05-21
- [phase 0] other loose SQL still in `supabase/` (`tournaments.sql`, `tournament-rounds.sql`, `tournament-images-bucket.sql`, `tournaments-featured-and-updates.sql`, `payments.sql`, `site-settings.sql`, `storage-bucket.sql`, `league-round-overrides.sql`, `migrate-registration-type-adult-youth.sql`) is out of Phase 0 scope but should be reconciled into timestamped migrations or removed in a future hygiene pass — discovered 2026-05-21
- [phase 2] `RegistrationsList` row+expanded-row Tournament link still points to `/admin/tournaments/{id}/edit` to preserve Overview parity; should switch to the Phase 1 view route `/admin/tournaments/{id}` once we have URL-state persistence (Phase 4) so the back button returns to a known filter — discovered 2026-05-21 — RESOLVED in Phase 4
- [phase 2] `/api/admin/registrations/[id]` PATCH only accepts `payment_status` today; expand to a whitelisted set (e.g. `notes`, `registration_type`) when admin row-edit lands — discovered 2026-05-21
- [phase 2] DocuSeal resend uses `PUT /submitters/{id}` with `send_email: true`; verify the response shape against the live DocuSeal account on first manual test and adjust if the email is not actually re-sent — discovered 2026-05-21
- [phase 2] `RegistrationsList` keeps the Registrations tab mounted via `hidden` so the count badge stays fresh; revisit when Phase 4 introduces URL-state for `activeTab` — discovered 2026-05-21 — Phase 4 keeps the hidden-mount pattern intentionally so the registrations count stays live while on Payments; URL state for `tab` now persists across reloads but the dual-mount is still warranted, leaving as accepted
- [phase 2] CSV "Amount Paid" column emits an empty string for zero totals to match the existing Overview export; consider always emitting a numeric `0` when the export gets a dedicated review — discovered 2026-05-21
- [phase 3] `registrations.team_name` is free text and is never reconciled to `teams.name`; if Teams is kept, decide whether `team_name` becomes a derived display field or stays as a legacy free-text fallback — discovered 2026-05-21
- [phase 3] `tournaments.max_teams` is editable on the tournament form but never compared against the actual team count anywhere in the UI; revisit when Teams gets a real workflow or remove the column with the rest of Teams — discovered 2026-05-21
- [phase 3] current `/admin/teams` UI adds members from the `contacts` table directly, so a person can be on a team for a tournament without having a registration row for that tournament; if Teams is kept, switch the membership source to `registrations` — discovered 2026-05-21
- [phase 4] `/admin/tournaments` has no filter UI today, so only scroll-restoration is wired; if/when a status or featured filter ships, persist it through `useQueryParam` like the other list pages — discovered 2026-05-21
- [phase 4] `RegistrationsList` sort and expanded-row state are still local-only; URL-syncing `sort`, `dir`, and expanded id would let admins deep-link to a specific roster view, but is out of scope for Phase 4 (filter-only) — discovered 2026-05-21
- [phase 4] `useScrollRestoration` is opt-in per page via a string key; if more admin lists are added later, remember to wire the hook in or extract a generic admin list wrapper that does it automatically — discovered 2026-05-21
- [phase 5] `needs_admin_review` is set on registrations but not yet surfaced in `RegistrationsList`, `/api/admin/registrations` GET select, or the contacts merge UI; expose it as a badge/filter and wire a one-click "merge contacts" action in a later admin-UX pass — discovered 2026-05-21
- [phase 5] `linkRegistrationToContact` runs after the registration insert but before the waiver-skip / DocuSeal branches; if either of those branches later wants to use the post-link `contact_id`, re-read the row instead of trusting the in-memory `contact` from `upsertContactByEmail` — discovered 2026-05-21
- [phase 5] backfill script requires `npx tsx --env-file=.env.local`; consider adding a `package.json` script alias (`backfill:reg-contacts`) once the team is comfortable with the dry-run output — discovered 2026-05-21
- [phase 5] `scripts/test-register-phase5.ts:139` breaks `next build` with `'collisionReg' is possibly 'null'` (pre-existing on f95adfb, not introduced in Phase 6); either narrow with a non-null check after the `?.contact_id` test or exclude `scripts/` from the Next.js tsconfig include — discovered 2026-05-21 — RESOLVED in wrap-up 2026-05-21 (narrowed with explicit non-null guard, mirroring `scripts/verify-phase5.ts`)
- [phase 6] header now does a Supabase `auth.getUser()` on every render to decide Account vs. Sign-in; revisit if it shows up as a per-page latency hit (could be cached with `unstable_cache` or moved to a small `<HeaderAccountLink />` client component that hits `/api/me/status`) — discovered 2026-05-21 — RESOLVED in Phase 14 (`getCurrentAuthUser` and `getCurrentPlayer` are React `cache()`-wrapped, so multiple Server Components in a single request share one Supabase round-trip; `/api/me/status` is also exposed for client surfaces that want a fresh probe)
- [phase 6] new-player flow: when a magic-link user has no existing `contacts` row, we lazily insert one with empty `first_name`/`last_name`; if the user never visits `/me` to fill it in, follow-up admin emails / exports could show blanks. Consider a "complete your profile" banner on `/me` and/or treating empty-name rows as `needs_admin_review` — discovered 2026-05-21
- [phase 7] `upsertContactByEmail` only enriches `first_name`, `last_name`, `phone`, `dob` from a registration submit; if a logged-in player edits `emergency_name`/`emergency_phone` on `/register`, the new values are stored on the registration row but NOT propagated back to the canonical `contacts` row. Player can still fix via `/me`. Consider widening the helper or doing a separate emergency-fields backfill on register — discovered 2026-05-21
- [phase 7] `/register` runs `getCurrentPlayer()` server-side on every page load, which is cheap (cookie validate + one row lookup) but lazily inserts a `contacts` row for first-time magic-link users who haven't visited `/me`. Acceptable today; revisit only if the auto-insert ever needs different defaults than what `/me` uses — discovered 2026-05-21
- [phase 9] smart pay redirect currently lands logged-in players with a pending+signed registration on `/pay?registrationId=...&payToken=...` (one click from Stripe). The North Star wording is "jumps straight to Stripe Checkout"; a future pass could either auto-submit the paid-flow form on mount or call `getStripe().checkout.sessions.create()` server-side from `/pay/page.tsx` and `redirect()` to `session.url` directly. Today's two-step keeps the Stripe call inside the existing `/api/stripe/checkout` route, which is the safer choice — discovered 2026-05-22
- [phase 9] `getPayableTournamentBySlug` returns null when `payments_open=false` so the card click falls through to the default `/pay` view (no preselect). If a tournament card surfaces a Pay CTA while payments are closed (shouldn't happen — the card hides the button — but possible if admin closes payments between page-load and click) the user lands on the default form with no warning. Consider surfacing a small "payments are closed for that tournament" banner when `?tournament=<slug>` resolves to a payments-closed row — discovered 2026-05-22
- [phase 9] smart-redirect picks the most recent pending+waiver-signed registration for `(contact_id, tournament_id)`. If a player somehow has more than one pending registration for the same tournament (shouldn't happen post-Phase-7 one-click re-registration), only the newest is offered. Add a uniqueness constraint or admin warning if duplicates ever appear in the wild — discovered 2026-05-22
- [phase 11] "has password" tracking lives in `auth.users.user_metadata.has_password` (set on every successful in-app password write). A user whose password was set out-of-band (Supabase dashboard, future admin tooling, external migration) will read as `hasPassword: false` on `/me/security` and be allowed to "set" a new password without confirming the old one. Acceptable today (no such users exist) but worth revisiting when an admin password-reset surface ships — discovered 2026-05-22
- [phase 11] `/me/security` SecurityForm verifies the current password by calling `signInWithPassword({ email, password: current })` against the live Supabase Auth, which counts toward Supabase's per-IP auth rate limits. With the cold "Save" path that's two auth calls per password change. Acceptable for the current player volume; if rate-limit headroom ever gets tight, switch the verify step to a custom Edge Function that hashes against `auth.users.encrypted_password` directly — discovered 2026-05-22
- [phase 11] `PasswordForm` uses `window.location.assign(nextPath ?? "/me")` after a successful sign-in instead of `router.push` + `router.refresh` so the next request is guaranteed to hit middleware with the freshly-written Supabase session cookies. Slight full-page flash on sign-in. Revisit if/when the existing `@supabase/ssr` cookie-write timing is verifiably durable across a soft navigation — discovered 2026-05-22
- [phase 12] Apple Sign In's client secret is a JWT with a max validity of ~6 months; if Supabase's in-dashboard "Generate client secret" tool isn't auto-rotating for our project, set a calendar reminder to regenerate per `docs/AUTH-CONFIG.md` section 9.3. Symptom of expiry is `invalid_client` on every Apple attempt — discovered 2026-05-22 — Runbook expanded in Phase 15 (`docs/AUTH-RUNBOOK.md` → Rotating Apple Sign In JWT), with explicit step-7 calendar-reminder note; underlying ops task (set the reminder) still falls on the operator
- [phase 12] Apple only sends the player's name on the very first authorization for a given app, by Apple's design. If our first-sign-in `getCurrentPlayer` lazy insert ever fails after Apple has consumed the name (e.g. RLS hiccup), the contact row is created on the next sign-in with empty name fields and no way to recover from Apple. Acceptable today since `/me` lets the player self-edit; revisit if support tickets surface this — discovered 2026-05-22
- [phase 12] OAuth buttons render unconditionally on `/login`. If Google or Apple is misconfigured in Supabase, clicking the disabled provider yields a generic "oauth_failed" with the provider's `error_description`. Once Phase 14's header polish is in, consider hiding either button via a server-side feature flag so we don't show options that aren't actually wired — discovered 2026-05-22
- [phase 12] Identity merge depends on Supabase's "Confirm email" being on (documented in `docs/AUTH-CONFIG.md` section 7). There's no app-side guard or admin-diagnostics check today — if an operator disables it, duplicate `auth.users` rows can form silently. Add a lightweight assertion to `/admin/diagnostics` (Phase 10 surface) that flags when "Confirm email" is off — discovered 2026-05-22 — Phase 15 added a recovery procedure in `docs/AUTH-RUNBOOK.md` → "Identity-merge silent duplicates" (how to detect and merge after the fact); the proactive diagnostics-check is still TODO because `supabase.auth.admin.getSettings()` doesn't expose the "Confirm email" toggle in the current SDK
- [phase 13] `hasAuthUserForEmail` pages a single `listUsers({ page: 1, perPage: 1000 })` call and filters in JS because supabase-js v2 has no typed `getUserByEmail` admin endpoint. Fine for HPS launch scale; once `auth.users` exceeds ~1000 rows we'll need to either iterate pages, query the GoTrue REST admin filter directly, or expose a Postgres view of `auth.users` for fast email lookup — discovered 2026-05-22
- [phase 13] `/pay/success` runs `getStripe().checkout.sessions.retrieve` + `recordCheckoutSessionPayment` + `getCurrentPlayer` + `hasAuthUserForEmail` in series on every visit. With the Stripe round-trip and the listUsers call this is ~300–600ms server-side per page render. Acceptable today (post-checkout is rarely thrashed) but worth caching the Stripe session retrieval against `session.id` if it ever becomes a perceived-latency issue — discovered 2026-05-22
- [phase 13] The Stripe webhook's `inviteUserByEmail` only fires when `recordCheckoutSessionPayment` returns `"recorded"` (first time we see a Stripe session id). If that first call fails GoTrue/SMTP and Stripe retries the webhook, the second delivery sees `"already_recorded"` and skips the invite — so a transient SMTP outage on the first delivery is not retried. Acceptable because the success page also exposes the claim card, but if support tickets ever surface this, add a small `claim_invites_sent` table or stamp `payments.claim_invited_at` to drive a one-shot retry — discovered 2026-05-22
- [phase 13] `/pay/success` still hard-codes the "Spring Classic 2026 — Every Friday starting Mar 27" blurb that pre-dates the multi-tournament era. Now that the page is a Server Component with the Stripe session in scope, it could pull tournament title + dates from session metadata. Out of Phase 13 scope; revisit when polishing post-checkout copy — discovered 2026-05-22
- [phase 13] `/api/stripe/verify-session` is no longer called by `/pay/success` (server-side render now records the payment directly via `recordCheckoutSessionPayment`). The route is left in place because external callers may still hit it, but if no caller surfaces in Phase 14/15 audits it should be deleted — discovered 2026-05-22 — Phase 15 audit: confirmed zero in-repo callers (only doc-comment references in `src/app/pay/success/page.tsx`). Deletion deferred to a future hygiene pass since Phase 15 is scoped to hardening + docs only; tracked in the Phase 15 wrap-up line below
- [phase 14] `AccountMenu` accepts `displayName` from the server and never refetches `/api/me/status` on its own. A sign-out from another tab is therefore not reflected in the header until the next full-page navigation. Acceptable today (we sign out from the same tab via the menu's own form) but if cross-tab session sync ever matters, hook the menu up to a `visibilitychange`-driven `/api/me/status` ping — discovered 2026-05-22
- [phase 14] "My registrations" deep-link is `/me#registrations` and currently only anchors at the *upcoming* section. Past registrations live below it; if a user with no upcoming events clicks the link, they land on an empty state. Consider scrolling to whichever section has rows, or merging the two into a single tabbed surface — discovered 2026-05-22
- [phase 14] `describeSignInMethods` reads `user.user_metadata.has_password` to distinguish "Email + password" vs "Magic link only". Same caveat as Phase 11: a user whose password was set out-of-band (Supabase dashboard, future admin tool) will appear as "Magic link only" until their next in-app password write — discovered 2026-05-22
- [phase 14] `/api/me/status` returns `{ authed, displayName }` and is rate-limited only by the underlying Supabase `getUser` call. If a hostile client polls this aggressively it'll burn through Supabase Auth's per-IP rate budget. No rate-limit middleware exists in the repo today; revisit during the Phase 15 hardening pass if the route attracts abuse — discovered 2026-05-22 — Phase 15 hardening pass: explicitly deferred. No abuse observed in logs; the route is `cache()`-wrapped at request scope and Supabase Auth itself rate-limits per IP. Revisit when (a) abuse is observed, or (b) a general rate-limit middleware ships for other reasons
- [phase 15] wrap-up: phases 9–14 reviewed against `FOLLOWUPS.md` on 2026-05-22. Closed nothing destructively; annotated `[phase 12]` Apple JWT, `[phase 12]` identity-merge, `[phase 13]` `/api/stripe/verify-session`, and `[phase 14]` `/api/me/status` rate-limit with their Phase 15 dispositions (runbook coverage, audit findings, or explicit defer). Genuinely deferred work: admin diagnostics check for "Confirm email" toggle (blocked on SDK surface), `/api/stripe/verify-session` deletion (out of phase 15 docs-only scope), rate-limit middleware (deferred until abuse), hard-coded "Spring Classic 2026" blurb on `/pay/success`. New auth surface in this phase: `docs/AUTH.md` (rewritten), `docs/AUTH-RUNBOOK.md` (new), `scripts/smoke-auth.ts` (new), `src/middleware.ts` (comment-only clarification of why `/auth/*` is intentionally NOT in the protected list) — discovered 2026-05-22
- [phase 15] verification pass on 2026-05-25 (post-implementation): static checks all green after fixing one regression — `src/lib/player-auth.ts::getCurrentAuthUser` was swallowing Next.js's internal `DYNAMIC_SERVER_USAGE` bailout signal and noisily logging it on every static-generation probe; added `isNextDynamicBailout` re-throw guard so bailout signals propagate cleanly. Build now zero-noise. Live smoke (`AUTH_SMOKE=1 ... scripts/smoke-auth.ts`) against `houspremiersoccer@gmail.com` returned 7/7 green from the Supabase API surface — actual email delivery depends on SMTP wiring per `docs/AUTH-CONFIG.md` §4a. The 8-step Phase 15 acceptance checklist is now a maintenance bar, not a one-shot — operators should run it after any auth-surface change. Followup tracking moves to Phases 16–19 (`hps-phases.mdc` rewritten for open-play events) — discovered 2026-05-25
- [phase 10] `docs/AUTH-CONFIG.md` §4 split into 4a (Gmail SMTP — no DNS needed, HPS production path) and 4b (transactional provider — when SPF/DKIM are workable). Reason: Namecheap MX/SPF/DKIM configuration was a dead end for the operator; Gmail SMTP solves deliverability with App Password + 2FA and zero DNS. Sender becomes `houspremiersoccer@gmail.com`. `docs/AUTH-RUNBOOK.md` triage table gained a row pointing to §4a when registrar DNS is the blocker — discovered 2026-05-25
- [pre-phase-16] admin tournament form now exposes `drop_in_fee_cents` via an "Offer guest / single-round tier" toggle + dollar input; toggle OFF saves `drop_in_fee_cents=0` which the existing `PayForm` already treats as "hide the Guest card." Side-effect: `src/app/admin/drop-ins/page.tsx` pre-fills the New Drop-in modal amount from `drop_in_fee_cents`, so for events where the toggle is OFF the modal pre-fills $0 — operator can override per-row. Acceptable today; if admin walk-in pricing diverges from the public guest tier for the same event, split into two columns (`drop_in_fee_cents` for /pay, `admin_drop_in_default_cents` for the modal) — discovered 2026-05-25
- [WC-0] World Cup portrait flyer + DB row synced via `scripts/update-world-cup-tournament.mjs`; banner uses `TournamentBannerImage` object-contain for custom `image_url`. Phased launch plan + rules: `.cursor/plans/world-cup-launch-session.md`, `.cursor/rules/world-cup-launch.mdc` — discovered 2026-06-03
- [WC-1] Production auth broken (operator-confirmed): magic link callback does not persist session (header stays "Sign in", /me not authed); Google OAuth non-functional; Apple OAuth non-functional. Leading hypothesis: `src/app/auth/callback/route.ts` cookies not attached to redirect `NextResponse`. Track in WC-1 before World Cup pay/register UX — discovered 2026-06-03
- [WC-1] Fixed: `createSupabaseRouteHandlerClient` binds auth cookies to the outgoing redirect in `/auth/callback` and `/auth/signout`. If Google/Apple still fail after deploy, check Supabase redirect allow list + provider config (`/admin/diagnostics`, `docs/AUTH-CONFIG.md`) — discovered 2026-06-03
- [WC-2] Spring Classic marked completed via `scripts/complete-spring-classic.mjs` (status completed; registration/payments/featured closed). Re-run script only if row was reset manually — discovered 2026-06-03
- [WC-3] World Cup register instructions on `/register` when `world-cup-summer-tournament` selected; slug constant in `src/lib/world-cup-pricing.ts` (pricing helpers land in WC-4) — discovered 2026-06-03
- [WC-4] World Cup pay UI (`PayForm` team full/share/captain-paid); checkout API still generic until WC-5 — discovered 2026-06-03
- [WC-5] World Cup checkout (`team_full`/`team_share`), Stripe metadata (`pay_kind`, `team_name`, `roster_size`), `captain-paid-ack` route, `stripe-payments` team_name on paid — discovered 2026-06-03
- [WC-6] Admin Registrants tab shows `team_name` column per tournament + CSV export — discovered 2026-06-03
- [WC-7] Operator acceptance checklist `docs/WORLD-CUP-ACCEPTANCE.md`; pre-flight `scripts/verify-world-cup-launch.mjs` — discovered 2026-06-03
- [meta] Project status + open-play handoff: `docs/PROJECT-STATUS.md`, `.cursor/plans/open-play-session.md`; `hps-phases.mdc` active Phases 17–19; `world-cup-launch.mdc` archived (`alwaysApply: false`) — discovered 2026-06-03 — SUPERSEDED: open-play Phases 16–19 never built; removed from active planning 2026-06-03
- [pay-gate] Tournament email pay gate T1–T4 shipped; acceptance `docs/PAY-GATE-ACCEPTANCE.md`; plan archived `docs/archive/tournament-email-pay-gate-plan.md` — discovered 2026-06-03 — SHIPPED 2026-06-03
- [pay-gate UX] Operator reports email eligibility loop blocks checkout; wants single pay/register CTA, facility-level waiver copy, signed-in "enroll" not "register", full tournament context on flow — handoff `docs/HANDOFF-PLAYER-PAY-FLOW.md` for Claude — discovered 2026-06-03
- [tournament-hub] Live DB already had empty `matches` + `match_scorers` tables (an unfinished prior attempt; not in repo migrations, unreferenced by code). Built the tournament hub on top of them rather than creating parallel tables; added migration `20260619140000_create_matches_and_scorers.sql` (idempotent create + `match_number`/`sort_order` backfill + public-read RLS) — discovered 2026-06-19
- [tournament-hub] World Cup tournament had two leftover test teams ("NORTH KOREA", "RED") with no fixtures; `computeStandings` now only lists teams that appear in a match so they don't pollute the table, but consider deleting them from admin Teams tab — discovered 2026-06-19
- [tournament-hub] Build/typecheck could not be run (shell environment returned no exit status all session); verified data layer end-to-end via Supabase MCP (24 matches, 2 completed, top scorers Daniel 6/Josh 4/Gavin 3) and reviewed types manually. Run `npm run build` to confirm — discovered 2026-06-19
- [tournament-hub] World Cup Standings tab is now a slug-gated OVERRIDE (`src/lib/world-cup-standings.ts`, wired in `src/app/events/[slug]/page.tsx`) that publishes the operator's flyer summary table verbatim instead of `computeStandings`. Reason: the flyer's match grid and its summary table disagree, and the summary is not reproducible from any set of scores (it lists 11 wins vs 13 losses league-wide, e.g. Mexico shows 1W/4pts in the summary while its results show wins in #4 and #12). Schedule/Results/Top Scorers stay computed from real match data, so the Standings tab intentionally diverges from Results for Mexico/India. Remove the override branch to revert to computed standings — discovered 2026-07-08
- [tournament-hub] Rounds 2-5 scores + scorers added to `scripts/seed-world-cup-schedule.mjs` from the flyer; match #9 kept as Mexico 1-3 India per operator. Several flyer scorer lists are truncated/illegible ("Cha...", "Flyin x2,...", jersey numbers, assist notes), so scorer rows (and thus the Top Scorers tab) are best-effort; match scores are exact. Applied to the live DB via Supabase MCP (shell has no `.env.local`, so the `.mjs` could not run here) - matches #2-9,#11-15 completed, #1/#10 postponed with makeup notes. The live DB had drifted (partial admin edits: #5 was 6-3, #6 was 3-6, #8 away was 2, #9 was 2-8, and #7-#15 mostly still "scheduled"); all corrected to the flyer. Re-running the seed script reproduces the same canonical state — discovered 2026-07-08
- [rebuild] Full audit of production data + admin/public UX on 2026-08-12; findings and the operator's locked decisions are in `docs/REBUILD-PLAN.md`, which is now the active plan (supersedes `docs/HANDOFF-PLAYER-PAY-FLOW.md` and the `hps-phases.mdc` phase list). Headlines: 61% of World Cup registrations had no team because team is captured at payment not signup; `team_members` has 0 rows and is dead; `waiver_document_url` is NULL for all 104 registrations despite 97 marked signed; 28 auth accounts exist but only 5 ever signed in; 3 duplicate contacts traced to hand-typed email typos; no privacy/terms/refund pages (blocks Google OAuth verification) — discovered 2026-08-12
- [rebuild] Phase 0 (data-only) applied to production 2026-08-12: World Cup + Open Play marked completed with registration/payments closed, "TESTING" pinned update deleted. The live site had been accepting payments for an Open Play held 2026-08-09. Rollback SQL was captured at the time; re-deriving it from `docs/REBUILD-PLAN.md` §7 is possible if needed — discovered 2026-08-12
- [rebuild] Phase 1a shipped: `src/lib/tournament-state.ts` derives "is this event over" from its own dates and every money/signup path gates on it (Stripe checkout incl. drop-ins, pay-eligibility, pay options, pay-by-slug, register, featured, archive). Fail-safe by design — a past event refuses to sell even with `payments_open` left true. Events stay live through the whole of their final day in Houston time. Tests: `npx tsx scripts/test-tournament-state.ts` (8 cases). NOTE: `getRecentEvents` no longer filters on `status='completed'` — the archive now fills itself from dates — discovered 2026-08-12
- [rebuild] Track A1 shipped: one "Event status" dropdown (Draft / Open / Closed / Cancelled) in `TournamentForm`, replacing Status + Registration Open + Payments Open + the featured toggle + Display Order. `finished` is never offered and never stored — when the dates say the event is over the form renders a locked card and **omits all four state columns from the save payload**, so editing a past event cannot write "finished". `status` is now derived from the dates by `deriveStoredStatus` and never returns `'completed'`. Draft is stored in the new `tournaments.is_draft` column (migration `20260812190000_add_tournaments_is_draft.sql`), which also narrows the public RLS read policy from `using (true)` to `using (is_draft = false)`. **DEPLOY ORDER MATTERS: the migration must be applied before the code ships, or every query selecting `is_draft` returns a PostgREST 42703 and the public site + pay flow break.** `is_draft` was made a *required* field on `StatefulTournament` on purpose — the compiler then found all 6 money/signup paths whose explicit `.select()` lists needed it, rather than letting them silently fail open — discovered 2026-08-12
- [rebuild] `getTournamentById` in `src/lib/tournaments.ts` has no callers and does not filter drafts. Harmless today; delete it or add the filter before anything starts using it — discovered 2026-08-12
- [rebuild] A1 removed the only UI that could set `registration_open` and `payments_open` independently. Any existing event stored in a mixed state (one true, one false) reads as "Open" in the form and is normalized to both-true on the next save. That is D1 working as decided, but it is a one-way door for per-flag control — discovered 2026-08-12
- [rebuild] Track A2 shipped (code): team is chosen at signup, not at payment. `/register` loads teams for every registration-open event up front via `getTeamsByTournament` and passes them to `RegistrationForm`; the picker only renders for events that actually have teams, with "Not sure yet — assign me later" as the default. `/api/register` writes `registrations.team_id`, but only after `resolveTeamId` confirms the posted team belongs to the tournament the registration resolved to — an unrecognised id is stored as no-team rather than erroring, since the signup and waiver matter more than the team pick. Deleted the "Do not enter a team name here" bullet and the "Team name is collected there, not on this form" footer, which is what produced 37/61 team-less World Cup registrations. NOT verified in a browser: local dev points at production Supabase, which does not have `is_draft` yet, so every tournament query 42703s until the A1 migration is applied — discovered 2026-08-12
- [rebuild] A2 leaves `registrations.team_name` (free text, 13 rows) untouched and still written by the pay flow. Two ways to express team membership remain until Track B3 folds both into `roster_entries` — discovered 2026-08-12
- [rebuild] Track A3 shipped: `RosterScreen` + `GET/POST /api/admin/tournaments/[id]/roster`, default tab on the tournament page. Merges `registrations` (players) and `drop_ins` (guests) into one list — the `roster_entries` shape assembled in the API until B3 makes it real. Verified end-to-end against production data: World Cup 61 signed up / 27 paid / 50 with no team, Community Cup 4 / 2 / 1 waiver, matching the §2 audit exactly. Waiver column distinguishes **Override** (admin tick, no document) from a real signature, because 39 of 57 contact waivers are overrides and a plain ✓ hides that — discovered 2026-08-12
- [rebuild] A3 walk-in add writes placeholders into the four NOT NULL `registrations` columns Track A can't touch: email `walkin-<digits>@walk-in.hps.local`, dob `1900-01-01`, empty emergency name/phone. The email is derived from the phone so adding the same person twice reuses one contact instead of inventing a second human. `isPlaceholderEmail` hides it in the UI and B1 can sweep the domain. Remove all of this in B3 when person fields move to `people` — discovered 2026-08-12
- [rebuild] A3's read path is verified against production; the **write** paths are not. Team-change and mark-paid reuse `PATCH /api/admin/registrations/[id]` and `PATCH /api/admin/drop-ins/[id]`, which were already in use by the old list, but the new walk-in POST has never been run — testing it would have written a real row to the live database. Exercise it once with a throwaway player before the owner relies on it — discovered 2026-08-12
- [rebuild] The roster "Needs details" flag fires on any row missing an emergency contact, not just walk-ins — several legacy World Cup registrations show it. That is accurate and arguably useful, but it means the flag is not a walk-in marker. If a true walk-in marker is needed later, key off the placeholder email rather than adding a column — discovered 2026-08-12
- [rebuild] Guests (`drop_ins`) appear on the roster read-only for team: `drop_ins` has no `team_id`, so the row shows "—" and the picker is hidden. D7's "guest fills in for a team for one night" needs B3's `roster_entries.team_id` + `round_id` — discovered 2026-08-12
- [rebuild] Track A4 shipped (code): "Sign now" on any roster row whose waiver is not a real document — including the amber Override rows, since swapping a ticked box for a signature is the point. `POST /api/admin/registrations/[id]/sign-waiver` creates a DocuSeal submission with `send_email:false`; `GET` on the same route polls DocuSeal and records the result. The poll exists so the ✓ appears while the player is still standing there instead of depending on the webhook — discovered 2026-08-12
- [rebuild] **Root cause of `waiver_document_url` being NULL for all 104 rows: `/api/admin/sync-waivers` never wrote the column.** There were three copies of "record a signed waiver" (docuseal webhook, sync-waivers, and the waiver-skip branch of /api/register) and they had drifted; sync-waivers updated `waiver_signed`, `waiver_signed_at`, `docuseal_status` and the contact's waiver fields but silently omitted the document URL on both tables. Consolidated into `recordSignedWaiver` in `src/lib/waiver-capture.ts`, which writes the link in the same statement as the signed flag. Re-running sync-waivers should now backfill links for anything still in `docuseal_status='sent'` — but note it only scans `sent`, so the 97 already flipped to `signed` will NOT be picked up and still need a separate backfill (B4) — discovered 2026-08-12
- [rebuild] A4 is **completely unexercised against DocuSeal**: all four `DOCUSEAL_*` vars are empty strings in `.env.local`, so no local request can reach them. Verified instead: 401 without admin auth, 400 on a bad id, 503 with the message "DocuSeal is not configured on this server" on both POST and GET, and the modal surfacing that 503 without breaking. The create-submission, poll, and capture paths have never run — discovered 2026-08-12
- [rebuild] Check whether `DOCUSEAL_WEBHOOK_SECRET` is actually set in production. The webhook returns 503 and processes nothing when it is missing, which combined with the sync-waivers bug above would fully explain 97 signed waivers and zero stored documents. If it is unset, set it and re-point the DocuSeal webhook — discovered 2026-08-12
- [rebuild] A4's `sign-waiver` POST overwrites `docuseal_submission_id` on the registration with the new submission. If a player had an earlier unsigned submission, the old one is orphaned in DocuSeal (harmless, but it will sit in their dashboard forever). Fine for walk-ins; revisit if it ever creates clutter — discovered 2026-08-12
- [rebuild] Track A5 shipped: `/privacy`, `/terms`, `/refunds`, `/cookies` on a shared `LegalPage` shell, all four linked from the footer, and the public `/admin` link removed from the footer (verified: no `/admin` href anywhere on a public page). Content written from what the code actually does — the collection list matches `RegistrationForm` field for field, processors are the four really in use (Supabase, Stripe, DocuSeal, Vercel), and the cookie notice is deliberately short because the site sets only `sb-*` and `admin_token` and loads no third-party tracking scripts. Verified: all four routes 200, clean production build, no console or server errors, no horizontal overflow at 375px — discovered 2026-08-12
- [rebuild] **A5 pages are published but NOT legally reviewed.** Defaults chosen that the operator must confirm or change: 7-year payment retention; Texas law with Harris County venue; liability capped at the amount paid for the event; refunds full >7 days before first match, credit-only inside 7 days, none once started; team fee non-refundable once the schedule is published; and no registered legal entity name anywhere (trading name "Houston Premier Soccer" only). If the business is an LLC, the entity name should replace or accompany the trading name — discovered 2026-08-12
- [rebuild] A5 claims in `/privacy` that there are no third-party analytics or advertising trackers. That is true today (`src/lib/analytics.ts` posts to our own `/api/analytics`, and `layout.tsx` loads no third-party scripts). **If anyone later adds Google Analytics, Meta Pixel, Vercel Analytics or similar, `/privacy` and `/cookies` become false and a consent banner likely becomes necessary.** Treat those two pages as something to update in the same PR — discovered 2026-08-12
- [rebuild] Google OAuth verification needs the privacy policy URL registered in the Google Cloud console — publishing `/privacy` is necessary but not sufficient. Add `https://<domain>/privacy` to the OAuth consent screen once this deploys — discovered 2026-08-12
- [rebuild] Track A deployed to https://www.houstonpremiersoccer.com 2026-08-12, `main` @ `aaab13c` (six commits fast-forwarded). Migration order held: `is_draft` was already applied to production before the code shipped. Verified live: 10/10 public routes 200, `/register` shows the 3rd Ward FC picker, four legal pages render with address + contact email from site settings, no `/admin` link on any public page, no console errors, `/events` unaffected by the new draft filtering — discovered 2026-08-12
- [rebuild] **A locally-signed admin cookie is rejected by production** (different `APP_SIGNING_SECRET`), so the admin UI could not be exercised against the live site from here. Route deployment was confirmed indirectly instead: the new roster and sign-waiver routes return 401 while `/api/admin/nonexistent-route` returns 404. The Roster screen, Event status dropdown and in-person signing have therefore never been clicked on production — the owner has to do that pass — discovered 2026-08-12
- [rebuild] Note for future sessions: `NEXT_PUBLIC_SITE_URL` in `.env.local` is `http://localhost:3000`, and the apex domain 307s to `www.`. Use `https://www.houstonpremiersoccer.com` when hitting production directly or every request costs an extra redirect hop — discovered 2026-08-12

## 2026-08-12 — one front door, in-app waivers, Google/Apple-only sign-in

- **Google/Apple providers are not configured in Supabase.** Production has 28 auth
  users, all provider `email`, zero `google`/`apple` — the OAuth buttons have never
  succeeded. Sign-in is now Google/Apple only, so until the dashboard config is finished
  nobody can sign in at all. Not player-blocking (register and pay both work signed-out),
  but it is the top item in REBUILD-PLAN §9.
- **The waiver text has not been reviewed.** `src/lib/waiver-text.ts` is what players
  legally sign. Same standing as the A5 legal pages — written from what the business does,
  not reviewed by anyone qualified. Bump `WAIVER_TEXT_VERSION` on any clause change.
- **In-app signatures are typed-name, not drawn.** Enough to produce a dated record with
  IP and waiver version, which is strictly more than the 39 `admin_override` ticks it
  replaces, but weaker than a countersigned PDF. Revisit when the PDF service returns.
- **`/waiver/<id>` is capability-secured** — unguessable UUID, noindex, no auth. Same
  posture as a DocuSeal document link. It shows the signer's own IP.
- **Old `type=recovery` auth links now land on `/me`** instead of a reset page. Harmless
  (they still carry a valid session) but the wording in any old email is now wrong.
- **`registrations` still has NOT NULL on email/dob/emergency fields**, so the walk-in
  placeholder workaround from A3 is unchanged. B3 removes the need.
- **Youth quick-join is never offered.** A contact's waiver has one type; an adult waiver
  on file does not satisfy a youth signup, so those players get the full form. Correct,
  but worth knowing before someone reports it as a bug.

## 2026-08-14 — signed-in experience, auth URLs, one canonical host

See [`docs/SESSION-LOG-2026-08-14.md`](docs/SESSION-LOG-2026-08-14.md) for the full account.
Open items, most urgent first:

- **Google sign-in has still never been completed end to end on the real domain.** Every
  piece is verified independently and the config is fixed, but the round trip needs the
  owner's Google account. Proof of success = a row in `auth.sessions` newer than 2026-07-01.
- **The signed-in screens are unverified** — team picker on `owes_payment`/`already_paid`,
  header waiver line, account menu. Shipped, typechecked, built; never exercised by a real
  session, for the same reason.
- **No database backups exist.** Free plan excludes them; Pro is $25/mo. REBUILD-PLAN Track
  B1 is destructive and instructs "back up first" — that instruction currently cannot be
  followed. A manual SQL dump was offered and not taken.
- **Exposed credentials are still valid at source.** A `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET` and `POSTGRES_PASSWORD` sat behind a public preview URL from
  2026-06-19 until today. The Vercel variables and the preview deployment are deleted, which
  closes the exposure but does **not** revoke the keys. Rotation deliberately deferred past
  the tournament — it is a coordinated change and every page reads the service-role key.
- **Vercel "Needs Attention" on `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `DOCUSEAL_API_KEY` is only "mark these Sensitive"** — not expiry, not error. Converting
  means re-entering a live Stripe key by hand; deferred past 2026-08-21 on purpose.
- **Community Cup has 2 teams and all 4 signups have `team_id = NULL`.** The pickers work
  now; there is just nothing for them to offer. Owner's job.
- **Vercel runtime logs are capped at 1 hour on the Hobby plan.** If something breaks
  overnight, the evidence expires before anyone reads it.
- **~14 `SUPABASE_*` / `POSTGRES_*` env vars in Vercel are unused** — dead weight from the
  native integration. The app reads only `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Harmless, but do not
  assume they are load-bearing when cleaning up.
- **`APP_SIGNING_SECRET` is not set in Vercel and does not need to be** —
  `src/lib/app-signing.ts` falls back to `ADMIN_SESSION_SECRET`, which is set. Renaming it
  someday would silence a deprecation warning; nothing is broken.

## 2026-08-14 (later) — the waiver round trip, and pay-later

- **Root cause of "you sign the waiver and nothing updates": the DocuSeal webhook is
  configured against the APEX domain, and Vercel 307s the apex to `www` at the edge.**
  DocuSeal **does not follow redirects** — it records the 307 as a delivered event and moves
  on, so the POST body never reaches the app. Verified in DocuSeal's own event log on
  2026-08-14: **10 of 10 deliveries are 307, the "Failed" tab is empty**, and every one of the
  7 stuck submissions is COMPLETED on DocuSeal's side with valid `registration_id` metadata.
  The signatures exist; they were never delivered.

  ```
  configured:  https://houstonpremiersoccer.com/api/docuseal/webhook      ← apex, 307s
  correct:     https://www.houstonpremiersoccer.com/api/docuseal/webhook
  ```

  ⚠ **This is not fixable in code.** The apex→www 307 is a Vercel *domain-level* redirect
  issued at the edge before middleware runs — see the comment in `src/lib/canonical-host.ts`
  that says exactly this. The URL has to be changed in the DocuSeal dashboard.

- **A second, latent fault sat behind the first: `DOCUSEAL_WEBHOOK_SECRET` is not set in
  Vercel.** `POST /api/docuseal/webhook` on the *www* host returns 503 before reading the
  payload (`route.ts` guards on the secret first). Nothing had noticed because no delivery
  ever got that far. **Fix the secret BEFORE fixing the URL** — otherwise deliveries start
  arriving into a 503, which DocuSeal *does* log as a failure and may burn retries on.

- **A diagnosis trap worth remembering:** `POST`ing the endpoint directly proves what the
  endpoint does, not what the sender experiences. The 503 was real and misleading. Always
  establish the URL the third party is actually configured with *first* — and check the
  sender's own delivery log, which is the only place the 307 was visible.

- ⚠ **Check every other third-party webhook for the same apex trap.** Stripe is the one that
  matters: if `STRIPE_WEBHOOK_SECRET` is set but the Stripe endpoint URL is the apex, payment
  webhooks are silently dying too. It would not be obvious, because `/pay/success` also
  records the payment server-side via `recordCheckoutSessionPayment` — so card payments still
  land and the broken webhook stays invisible until someone closes the tab before the
  success page renders.

  **7 registrations are stuck**, the oldest 2026-07-22, including two players who have already
  paid. No code change caused any of it: there are **zero commits between 2026-07-10 and
  2026-08-01**. It is entirely configuration.
- **The webhook's HMAC verification is correct** — checked against DocuSeal's documented
  scheme (`X-Docuseal-Signature: <timestamp>.<hmac>` over `<timestamp>.<raw body>`, raw bytes
  via `request.text()`). Nothing to fix there; it simply never gets to run. The secret is the
  `whsec_…` value under the webhook's Security → HMAC tab.
- **Waivers that flipped to signed before 2026-07-17 were almost certainly the admin "Sync
  Waivers" button, not the webhook.** `waiver_signed_at` is written from DocuSeal's
  `completed_at`, so those timestamps look like instant confirmations but say nothing about
  when we learned. Do not read them as evidence the webhook ever worked.
- **Fixed structurally: the app no longer depends on the webhook.** `src/lib/waiver-reconcile.ts`
  asks DocuSeal directly whenever a decision is about to be made from `waiver_signed`, on both
  `/register` and `/pay`. Same principle as A4's "Done — check". Setting the webhook secret is
  still worth doing (instant, and covers players who close the tab) but is no longer load-bearing.
- **`GET /api/docuseal/webhook`** is a new configuration probe — returns `ready`,
  `webhookSecretConfigured`, `apiKeyConfigured` as booleans. Added because this failure was
  invisible for a month behind a platform that keeps one hour of logs. Safe to leave public:
  booleans only, and the endpoint fails closed.
- **`needs_waiver` now resumes the player's existing DocuSeal submission** (`docuseal_sign_url`)
  instead of minting a second one, and carries an "I already signed — check again" link. Falls
  back to in-app signing only when the registration has no submission.
- ⚠ **`PayForm` must be the only thing inside its Suspense boundary on `/pay`.** It calls
  `useSearchParams()`, so it renders behind Suspense; rendering *anything* alongside that
  boundary — sibling in the same section, its own `<section>`, server or client component —
  strands the fallback `<template>` in the DOM and **the Pay button never appears at all**.
  Reproduced on a clean production build, not just dev. The roster banner and pay-later exit
  are therefore passed *into* PayForm as the `enrolled` prop. Do not compose them around it.
- **Pay-later is UI only — no schema change.** `payment_status` already had `'pending'` and
  `'partial'`, team is already written at signup, and the Roster already has the by-team panel.
  What was missing was the player-facing half: signup ended on a bare Stripe form, so someone
  not paying that day closed the tab unsure they had a spot. Their row existed the whole time.
- **Waiver stays a hard gate on roster membership** (operator's decision, 2026-08-14). `/pay`
  with a valid resume token now refuses to take money when the waiver is unconfirmed, which is
  the state that produced the two paid-but-unsigned Community Cup players.
- Tests: `npx tsx scripts/test-waiver-reconcile.ts` — 16 cases over the reconcile branch table
  and DocuSeal's document-URL shapes. `scripts/_mint-pay-token.ts` mints a **localhost-only**
  pay-resume link for exercising `/pay` in dev (signed with the local secret; production
  rejects it).

## 2026-08-14 (third) — cash-or-card, open play as a kind, viewer-aware CTA

- **`registrations.payment_method` is now live and was previously dead.** NULL on all 105 rows,
  declared in `types.ts`, written and read by nothing. It now stores the player's declared
  intent — `'cash'` or `'card'` — written only by `POST /api/register/payment-intent`.
  **NULL still means "they have not told us" and must never be read as "card."**
  `payment_status` is untouched by that route: a cash promise is not a payment, and
  `RosterTotals.payingCash` is a **subset** of `unpaid`, never added to it
  (`scripts/test-roster-totals.ts` asserts exactly this).
- **`tournaments.kind` shipped** (`20260814230000_add_tournaments_kind.sql`, applied to
  production 2026-08-14 *before* the code). Unlike `is_draft` this is **not** a deploy-order
  trap: `kind` is optional on `Tournament` and every read goes through `resolveEventKind()` in
  `src/lib/event-kind.ts`, which treats missing/NULL/unknown as `'tournament'`. An un-migrated
  database therefore renders the pre-existing site. ⚠ **Never gate money, sign-ups or
  visibility on `kind`** — those belong to `tournament-state.ts`, which is fail-safe by design.
- **The live "Open Play: Friday August 14th" row was set to `kind='open_play'`** during
  verification. Correct data (it is an open play night), and invisible to the deployed code,
  which does not read the column. Revert with one UPDATE if unwanted.
- ⚠ **That same row still has TWO prices** — `entry_fee_cents` $15 and `drop_in_fee_cents`
  $10 — so `/pay` offers a single evening two tiers. The admin form now forces
  `drop_in_fee_cents = 0` for open play, but only **on the next save** of that event. Existing
  rows need one save (or an UPDATE) to clear it.
- ⚠ **That row's slug is `open-play-july-27-28-2026` for an event titled "Friday August
  14th."** Every shared link carries the wrong date. One admin field — but it breaks links
  already texted out.
- **`viewerEventCta` in `tournament-public-links.ts` adds no branch logic** — it is a pure
  projection of `resolveSignupState` onto a button. `tournamentPrimaryCta` is preserved
  verbatim as the signed-out case, and `scripts/test-event-cta.ts` asserts parity against it
  for all four event shapes rather than against hard-coded strings, so the two cannot drift.
- ⚠ **`/events/[slug]` must NOT call `reconcileIfUnsigned`.** It is the most-visited page on
  the site and a DocuSeal round trip has a 6s timeout; `/register` and `/pay` reconcile because
  they hold a player at a gate, the event page only routes them there. Commented at the site.
- **`findRegistration`/`teamNameFor`/`formatFee` moved out of `/register/page.tsx`** into
  `src/lib/event-standing.ts` and are now shared. `/register` passes its DocuSeal-reconciled
  row back in via `registrationOverride` — without that a player who just signed would be
  resolved from the stale column and told to sign again.
- ⚠ **The `/pay` Suspense constraint still holds and was re-verified on a production build.**
  `PaymentChoice` is safe inside `PayForm` only because it is a client component with **no
  async children**. Do not give it one.
- **Admin nav says "Events", not "Tournaments"**, and `/admin/tournaments` groups by kind.
  Reorder arrows still key off the **global** `display_order` index (`IndexedEvent.index`) —
  re-indexing per section would swap non-adjacent events.
- **Not verified: the admin Roster screen visually.** The cash chip, the "Paying cash" filter
  and the open-play attendance view were checked through the API payload
  (`payingCash: 1`, `unpaid: 3`, `paymentMethod: "cash"`) and the totals unit tests, but the
  rendered screen needs the owner's login. Same limitation every prior session recorded.
- **`drop_ins` (0 rows ever) and `team_members` (0 rows ever) both still have admin UI.**
  `drop_ins` has its own nav item in front of a non-technical owner; open play supersedes the
  concept. Recommend retiring the nav item — deliberately NOT done unasked.
- **`/admin` still shows $0.00 revenue on load** (payments only fetch when the Payments tab is
  clicked; the header computes totals immediately). First number the owner sees. Known as B6.
