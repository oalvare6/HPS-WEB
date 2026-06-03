# World Cup Launch — Session Handoff Prompt

> **STATUS: COMPLETE (WC-0–WC-7).** Archive only — do not paste for new feature work.
>
> **New work:** scoped per session — `docs/PROJECT-STATUS.md`, `.cursor/rules/hps-phases.mdc`

---

## Historical handoff (WC-0–WC-7 — shipped)

---

## North star (acceptance)

1. **World Cup flyer** displays fully on homepage, `/events`, and `/events/world-cup-summer-tournament` (portrait poster, not cropped).
2. **Every player** (including team captain) completes **`/register?tournament=world-cup-summer-tournament`** → DocuSeal waiver signed.
3. **Register page** clearly states rules: everyone must register, waiver required, team fee options explained.
4. **`/pay?tournament=world-cup-summer-tournament`** offers:
   - **Pay full team — $960** (flat, always) + optional **Team name** field.
   - **Pay my share** — roster size **8–12**, amount = **$960 ÷ N** (honor system; admin reconciles).
   - **My captain already paid the team fee** — after waiver, skip Stripe; confirmation only; admin marks paid when building roster.
5. **Team name** captured on pay (and stored on registration/payment metadata) visible in **admin Registrants** for manual team/WhatsApp setup later.
6. **Spring Classic 2026** marked **completed** in admin/DB (no longer competing for attention with World Cup).
7. **Player login** works for returning users (magic link, password, Google/Apple — reproduce and fix whatever is broken; operator reports “doesn’t fully work yet”).
8. **Guest $20 drop-in tier** stays **hidden** for World Cup (`drop_in_fee_cents = 0` already set).

---

## Already shipped (local + DB — verify commit/deploy)

### Supabase row (live, updated via script)

| Field | Value |
|---|---|
| **id** | `a9deb6a8-c7bc-4193-b710-6e5202a3b56c` |
| **slug** | `world-cup-summer-tournament` |
| **title** | World Cup 7v7 Soccer Tournament |
| **format** | Youth 7v7 |
| **start_date** | 2026-06-08 |
| **end_date** | 2026-07-17 |
| **time_start / time_end** | 6:00 PM / 9:00 PM |
| **max_teams** | 16 |
| **drop_in_fee_cents** | 0 |
| **entry_fee / entry_fee_cents** | **null** (intentional — team pricing is custom, not per-player entry_fee) |
| **image_url** | `/tournaments/world-cup-2026-flyer.png` |
| **registration_open / payments_open** | true / true |
| **is_featured** | true |

Re-run if needed: `node --env-file=.env.local scripts/update-world-cup-tournament.mjs`

### Code (may be uncommitted — check `git status`)

- `public/tournaments/world-cup-2026-flyer.png` — portrait flyer asset
- `src/lib/tournament-image.ts` — `tournamentUsesPortraitPoster()` when `image_url` set
- `src/components/shared/TournamentBannerImage.tsx` — `object-contain` + 2:3 for uploads; 16:7 cover for presets
- Wired in: `src/app/events/[slug]/page.tsx`, `src/app/page.tsx`, `TournamentCard.tsx`, `FeaturedTournamentCard.tsx`
- `scripts/update-world-cup-tournament.mjs` — DB sync script
- Prior commit on main: `2a53be3` — admin drop-in fee toggle on tournament form

**First action in session:** commit + push + deploy portrait banner work if not already on production.

---

## Business rules (operator-confirmed 2026-06-03)

### Tournament structure (from flyer — admin handles groups manually later)

- High School Boys 7v7
- **$960 per team** (standard captain path)
- **Max 12 players per roster** (operational; not a DB column yet)
- **16 teams max** — Group A Mon/Wed (8), Group B Tue/Thu (8) — **assign in admin later**, not on public site
- Group stage Jun 8 – Jul 2; playoffs Jul 6 – Jul 14; final Jul 17
- Captain pays → gives team name → operator creates team + WhatsApp manually

### Payment math

| Option | Amount |
|---|---|
| Pay full team | **$960.00** always (96000 cents) |
| Pay my share | **$960 ÷ roster_size** where roster_size ∈ {8,9,10,11,12} |
| Captain already paid | **$0** at checkout — waiver still required via register |

Examples: 8 → $120, 10 → $96, 12 → $80 per player.

### Registration + pay flow (recommended implementation)

```
Player (including captain):
  /register?tournament=world-cup-summer-tournament
    → personal info + adult/youth + DocuSeal waiver
    → land on /pay?registrationId=...&payToken=...  (existing resume token path)

On /pay for World Cup:
  A) Pay full team $960 + Team name (optional/recommended)
  B) Pay my share: pick 8–12 → show $960/N → Stripe
  C) My captain already paid → POST ack endpoint → success page, payment_status pending/waived + note for admin

Captain who already paid $960 via path A before registering:
  Can pay first at /pay?tournament=... then register for waiver, OR register first then pay — both OK.
  If captain is also a player: must still complete waiver via register.
```

**Do NOT** require login to register/pay for v1 (auth fix is parallel; flows must work logged-out). Prefill when logged in is a bonus.

---

## Implementation plan (one session or ordered sub-phases)

### Step 0 — Baseline

- `git pull`, verify World Cup on production after deploy
- Reproduce **login bug** (document exact steps: magic link? password? header not updating? OAuth?)
- Run `npm run build`

### Step 1 — Auth fix (P0 — confirmed broken in production)

**Operator symptoms (2026-06-03):**
- Magic link: click link → still shows "Sign in" in header, no name/account menu, `/me` not signed in
- Google OAuth: does not work at all
- Apple OAuth: does not work at all

Investigate and fix without refactoring admin auth (`app-signing`).

**Leading hypothesis:** `src/app/auth/callback/route.ts` — session cookies not attached to redirect response after `exchangeCodeForSession`. See `.cursor/rules/world-cup-launch.mdc` Phase WC-1.

Key files:
- `src/lib/player-auth.ts`, `src/lib/supabase-browser.ts`, `src/lib/supabase-server.ts`
- `src/middleware.ts`
- `src/app/login/`, `src/components/auth/`
- `docs/AUTH-RUNBOOK.md`, `scripts/smoke-auth.ts`

Operator symptom: **magic link session doesn't stick; Google and Apple OAuth completely broken** — see `.cursor/rules/world-cup-launch.mdc` WC-1 for acceptance criteria.

### Step 2 — Spring Classic → completed

- Slug: `spring-classic-2026`
- Set `status = 'completed'`
- Consider: `registration_open = false`, `payments_open = false`, `is_featured = false` (confirm with operator if unsure)
- Script or admin PATCH; revalidate `/`, `/events`

### Step 3 — World Cup register UX

Files:
- `src/app/register/page.tsx`
- `src/components/register/RegistrationForm.tsx`

When selected tournament slug is `world-cup-summer-tournament` (or tournament id match):

- Show **instruction block** above form:
  - Every player must register individually
  - Waiver required before playing
  - Team fee: captain may pay $960 OR players split ($960 ÷ team size, min 8)
  - Group assignment handled by HPS after payment
  - Link to event detail / rules
- Optional: page title “Register for World Cup” instead of generic 7v7 copy
- **No team name on register form** (team name on pay only — operator confirmed)

### Step 4 — World Cup pay UI

Files:
- `src/components/pay/PayForm.tsx`
- `src/app/pay/page.tsx`
- `src/app/api/pay/options/route.ts` (may need tournament slug or flags in response)

When `selectedTournament.slug === 'world-cup-summer-tournament'`:

- **Hide** generic “Full Tournament Entry” / “Guest Drop-in” cards
- **Show** three World Cup cards:
  1. Pay full team — $960.00
  2. Pay my share — dropdown 8–12, live total preview
  3. (When `registrationId` present) My captain already paid — no Stripe

- **Team name** text input on options 1 and 2 (and optionally 3 for matching)
- Validate roster_size 8–12 on share path

Constants (prefer slug-gated config object in `src/lib/world-cup-pricing.ts` or similar — no new npm deps):

```ts
export const WORLD_CUP_SLUG = "world-cup-summer-tournament";
export const WORLD_CUP_TEAM_FEE_CENTS = 96000;
export const WORLD_CUP_MIN_ROSTER = 8;
export const WORLD_CUP_MAX_ROSTER = 12;
```

### Step 5 — Checkout API

Files:
- `src/app/api/stripe/checkout/route.ts`
- `src/lib/stripe.ts` (audit only)

Extend checkout body (hand-rolled guards, no `any`):

```ts
payKind?: "entry" | "drop_in" | "team_full" | "team_share" | "captain_paid_ack";
rosterSize?: number;      // 8–12 when team_share
teamName?: string;        // trim, max length
```

- `team_full` → 96000 cents, product name includes team name if provided
- `team_share` → `Math.round(96000 / rosterSize)`, validate bounds
- `captain_paid_ack` → no Stripe session; return success URL or handle via separate POST route that updates registration `payment_status = 'waived'` or `'pending'` with `notes` containing `captain_paid_claim` + team_name; set `needs_admin_review = true` if helpful

Stripe `metadata`: `tournament_id`, `pay_kind`, `team_name`, `roster_size`, `registration_id`

Store team name on:
- `registrations.team_name` (column exists) when registrationId present
- `payments.notes` or metadata for captain-first pay without registration

### Step 6 — Post-waiver redirect

Existing register API returns `signUrl = "/pay?registrationId=...&payToken=..."` — keep this.

Ensure World Cup pay form detects registration context and shows captain-paid skip.

### Step 7 — Admin visibility

Files:
- `src/components/admin/RegistrationsList.tsx`
- `src/app/api/admin/registrations/route.ts` GET select

- Show **team_name** column or in expanded row when present
- Filter/badge for `captain_paid_claim` / needs review
- No auto team creation this session — manual Teams tab later

### Step 8 — Spring Classic / regression

- Normal tournament pay/register unchanged for any future events
- World Cup logic **slug-gated only** — do not break Spring Classic or generic `/pay`

---

## Schema note

**No migration required** if using:
- `registrations.team_name` (exists)
- `registrations.notes` / `needs_admin_review` (exists)
- Stripe metadata + `payments.notes`

Optional followup (log in FOLLOWUPS.md, do not ship now):
- `tournaments.team_fee_cents` + `payment_mode` column for reusable team-pricing events
- `max_roster_size` per tournament

---

## Files likely touched (summary)

| Area | Files |
|---|---|
| Portrait banner (done) | `TournamentBannerImage.tsx`, `tournament-image.ts`, event/home cards |
| Auth | `player-auth.ts`, login components, middleware |
| Register | `register/page.tsx`, `RegistrationForm.tsx` |
| Pay | `PayForm.tsx`, `pay/page.tsx` |
| API | `api/stripe/checkout/route.ts`, maybe new `api/register/captain-paid-ack/route.ts` |
| Admin | `RegistrationsList.tsx`, admin registrations API |
| Scripts | `scripts/update-world-cup-tournament.mjs`, new `scripts/complete-spring-classic.mjs` |
| Docs | append FOLLOWUPS.md one-liners only |

**Do NOT touch:** admin auth (`app-signing`), unrelated drop_ins admin tool.

---

## Manual test checklist (operator)

1. Homepage + `/events/world-cup-summer-tournament` — full flyer visible, copy matches flyer.
2. Spring Classic shows **Completed** (or hidden from featured); World Cup featured.
3. Logged-out player: register World Cup → DocuSeal → pay page shows three World Cup options (not $20 guest).
4. Pay full team $960 + team name “Test FC” → Stripe test card → success; team name visible in admin registrants/payment.
5. Pay my share: select 10 → $96 → Stripe succeeds.
6. Captain already paid: after waiver, skip Stripe → confirmation; admin sees note/team name.
7. Login: magic link + password sign-in → header shows account → `/me` works.
8. Spring Classic register/pay unchanged or closed as expected.

---

## Open question at session start

Ask operator **one question** if login repro is unclear after attempting WC-1 fixes.

---

## Confirmed auth bugs (operator 2026-06-03) — Phase WC-1 P0

These are **not** theoretical. Document exact fix in WC-1 report.

| Method | Symptom |
|---|---|
| **Magic link** | Click email link → page loads but header still **"Sign in"** (no name, no AccountMenu). `/me` does not show signed-in profile/stats. Session not persisting after callback. |
| **Google** | **Does not work at all** — never completes sign-in. |
| **Apple** | **Does not work at all** — never completes sign-in. |

**Leading code hypothesis (magic link):** `src/app/auth/callback/route.ts` may call
`exchangeCodeForSession` but redirect without attaching auth cookies to the
`NextResponse`. Compare with `@supabase/ssr` route-handler pattern — cookies must
be written onto the redirect response, not only `cookies().set()` in a route that
then returns a fresh `NextResponse.redirect()`.

**Leading config hypothesis (Google/Apple):** Supabase Auth → URL Configuration →
Redirect URLs missing `https://houstonpremiersoccer.com/auth/callback` (and
`http://localhost:3000/auth/callback` for dev). Provider credentials / Apple JWT
expiry per `docs/AUTH-CONFIG.md`.

**WC-1 pass criteria:** After magic link / Google / Apple, header shows **AccountMenu
with first name**, `/me` loads profile, **hard refresh** still signed in.

**Primary rule file:** `.cursor/rules/world-cup-launch.mdc` (always applied).

---

## Suggested commit message (when operator asks)

```
World Cup: portrait flyer, team payment options ($960 / split / captain-paid skip), register copy, Spring Classic completed, auth fix.
```

---

## Context to ignore in this session

- (Removed) open-play roadmap — never built on `main`
- Public roster after event ends
- Auto Group A/B assignment
- WhatsApp integration
- Replacing manual team creation entirely

---

## Copy-paste opener for new session

```
Read .cursor/rules/world-cup-launch.mdc and .cursor/plans/world-cup-launch-session.md.
Execute ONE WC phase only (start WC-0 if banner uncommitted, else WC-1 auth).

P0 auth bugs (operator-confirmed 2026-06-03):
- Magic link: click link but header still "Sign in", no account name, /me not signed in
- Google OAuth: broken entirely
- Apple OAuth: broken entirely

Then World Cup Jun 8: team pay ($960 / $960÷N 8-12 / captain-paid skip), register
instructions, team name on pay, Spring Classic completed.

Slug: world-cup-summer-tournament. WC workstream complete — see PROJECT-STATUS.md for new work.
```
