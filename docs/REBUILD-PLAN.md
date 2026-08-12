# HPS Rebuild Plan

**Written 2026-08-12. This is the active plan — it supersedes `docs/HANDOFF-PLAYER-PAY-FLOW.md`
and the phase lists in `.cursor/rules/hps-phases.mdc`.**

If you are an AI assistant picking this up from a fresh clone: read this file end to end
before touching code. It contains the operator's decisions, the evidence behind them, and
the order of work. Do not re-litigate the decisions in "Locked decisions" — they were made
deliberately by the business owner.

---

## 1. Why this plan exists

The site works, but running a tournament with it is manual and error-prone. The operator's
words: *"we have to manually add ppl to teams check if they paid it just fucking sucks."*

The system is built around **email and money**. It needs to be built around **a person and a
roster**. Everything below follows from that one sentence.

---

## 2. The evidence (measured against production on 2026-08-12)

Do not skip this. Every phase exists because of a number here.

### Teams are barely used, because the model prevents it

| World Cup — 61 registrations | |
|---|---|
| Linked to a real team | 11 |
| Free-text team name only | 13 |
| **No team at all** | **37 (61%)** |
| Paid | 27 |
| `needs_admin_review` | 23 (38%) |

**6 of 7 teams played a full season with zero roster.** Brazil, India, Mexico, Morocco and
USA each played 7–9 matches with no players attached. Only Kazakhstan has any.

**Root cause:** `RegistrationForm.tsx` tells players *"Do not enter a team name here — you
will provide it on the payment page."* Team is captured **at payment**, so anyone who has not
paid has no team by design.

### Three ways to express team membership; two are dead

1. `registrations.team_id` — 11 rows
2. `registrations.team_name` (free text) — 13 rows
3. `team_members` table — **0 rows. Never used.** Has admin UI built on top of it.

### Waivers: none are actually on file

- 104 registrations have a DocuSeal submission, 97 marked signed.
- **`waiver_document_url` is NULL for all 104.** The PDFs live in DocuSeal; the app never
  stored the links.
- **39 of 57 contact waivers are `admin_override`** — a box ticked, not a signed document.

Net: full legal exposure, zero legal protection. There is no document to produce if a player
is injured.

### Player accounts are effectively unused

| Supabase auth accounts | 28 |
|---|---|
| **Ever signed in** | **5** |
| Signed in within 60 days | **2** |

Magic link, Google, Apple, password reset, `/me`, `/me/security`, account claim — six prior
phases of work serving two active users.

### Email identity is creating duplicate humans

```
omaralvarezz01@gmial.com  ←→  omaralvarezz01@gmail.com
jamanrique1985@gmail.con  ←→  jamanrique1985@gmail.com
elimcnally648@gmail.con   ←→  elimcnally648@gmail.com
```

Three duplicate people, all from hand-typed email typos. **In every case the phone number was
identical and correct.** 86 of 90 contacts have a phone; zero are malformed.

### Junk in production

- 6 test rows (`...@hps-verify.local`)
- 37 registrations with no tournament
- 6 payments linked to neither a registration nor a drop-in
- A leftover test team, `RED`
- World Cup standings are **hardcoded in `src/lib/world-cup-standings.ts`**, overriding real
  match data, because the operator's flyer contradicted the scores

### Missing entirely

No `/privacy`, `/terms`, `/refunds`, or cookie notice. This **blocks Google OAuth
verification** (Google requires a privacy policy URL) and violates Stripe's merchant terms.
Youth waivers collect minors' dates of birth. The public footer also links to `/admin`.

---

## 3. Locked decisions

Decided by the business owner on 2026-08-12. Build to these.

| # | Decision |
|---|---|
| D1 | **Event status = one dropdown, four states.** Draft / Open / Closed, plus **Finished, which is never stored — always derived from the end date.** "Show on homepage" is a separate star. |
| D2 | **Admin password is owner-changeable** from the admin UI (move out of env vars, no redeploy). |
| D3 | **Players pick their team from a dropdown at signup.** Not at payment. |
| D4 | **Identity = phone number.** Email is optional and demoted. Google/Apple sign-in links to the same person via phone. |
| D5 | **Keep Google + Apple sign-in. Drop magic-link and password sign-in.** Signed-in players see "waiver good through <date>" and go straight to pay. |
| D6 | **Open play and tournaments are different event kinds.** Open play = one date, door price, attendance. Tournament = teams, standings, season roster. |
| D7 | **Guests exist in both kinds.** Open-play guests pay a door price, and are **free if they are on an active tournament roster**. Tournament guests fill in for a team for one night at an owner-preset guest price. |
| D8 | **Waiver can be signed in person from the admin dashboard**, on the owner's laptop at the event. A walk-in signs on the spot; they still get an account and can pay. |
| D9 | **Carry over people + waivers, start rosters fresh.** All 90 people and 57 valid waivers survive so returning players never re-sign. Old tournaments stay browsable. New tournament rosters start empty. |
| D10 | **Draft real legal pages** (privacy, terms, refunds, cookie notice) covering what is actually collected. Operator gets them reviewed. Not legal advice. |

---

## 4. Target data model

Current tables that survive: `tournaments`→`events`, `teams`, `matches`, `match_scorers`,
`tournament_rounds`, `tournament_updates`, `payments`, `contacts`→`people`.

Tables that go away: **`team_members`** (dead), **`drop_ins`** (folded in), and the
`registrations` person-field duplication.

### `people` (was `contacts`)

Identity is the phone number.

```
id
first_name, last_name
phone           UNIQUE, normalized E.164   ← identity
email           optional; verified when it comes from Google/Apple
dob
auth_user_id    nullable → Supabase auth user, set on first Google/Apple sign-in
waiver_signed_at, waiver_expires_at, waiver_type, waiver_document_url, waiver_source
emergency_name, emergency_phone
```

### `events` (was `tournaments`)

```
kind                'tournament' | 'open_play'      ← D6
state               'draft' | 'open' | 'closed'      ← D1 (finished is DERIVED, never stored)
title, slug, description, start_date, end_date, time_start, time_end, location, image_url
entry_fee_cents             tournament season entry
guest_fee_cents             one-night fill-in price   ← D7
door_fee_cents              open-play door price      ← D7
guests_free_for_active_players  boolean               ← D7
is_featured
```

### `roster_entries` — replaces `registrations` + `team_members` + `drop_ins`

**This is the "who plays" table. One row = one person playing one event.**

```
id
event_id      → events
person_id     → people
team_id       → teams (nullable; null for open play and unassigned)
role          'player' | 'guest'          ← D7
round_id      → tournament_rounds (nullable; set for one-night guests)
payment_status 'unpaid' | 'paid' | 'waived' | 'refunded'
UNIQUE (event_id, person_id, round_id)     ← prevents double signup
```

Person details (name, email, phone, dob, emergency contact) live on `people` only. They are
**not** copied onto the roster entry — that duplication is what lets records drift today.

### `payments`

Replace the `registration_id` / `drop_in_id` pair with a single `roster_entry_id`.

---

## 5. Two tracks

**Community Cup starts 2026-08-21 — 9 days from this plan.** It currently has 4 signups,
0 teams, and 1 waiver. Track A is the minimum to run it properly. Track B is the deeper
cleanup, done after the season is safely underway.

Track A deliberately **does not touch the schema.** `registrations.team_id` already exists and
works; Track A uses it. The big migration is Track B, when there is no live deadline.

---

## Track A — before 2026-08-21

### A1. Finish "one switch" (D1) — ✅ code complete, migration not yet applied
Phase 1a already shipped (see §7). Phase 1b is now written too — see §7.

⚠ **The migration `20260812190000_add_tournaments_is_draft.sql` must be applied to production
before this code deploys.** Six queries select `is_draft`; without the column they return a
PostgREST 42703 and the public site and pay flow break.

### A2. Teams for Community Cup, and team-at-signup (D3)
- Owner creates the Community Cup teams in admin.
- Add a **team dropdown to the signup form**, populated from that event's teams, with a
  "Not sure yet" option.
- Delete the "Do not enter a team name here" copy.
- Write `registrations.team_id` at signup.
**Done when:** a new signup lands on a team without anyone touching admin.

### A3. The Roster screen (the owner's daily driver) — ✅ shipped
`src/components/admin/RosterScreen.tsx`, backed by
`GET/POST /api/admin/tournaments/[id]/roster`. It is the default tab on
`/admin/tournaments/[id]`; the old detailed list is still there as "Details".

- Season players (`registrations`) and one-night guests (`drop_ins`) merged into one
  list — the `roster_entries` shape from §4, assembled in the API until B3 makes it real.
- Totals: signed up / paid / still owes / waiver on file / no team.
- Filters: everyone, still owes money, no waiver, no team. Search over name, phone, team.
- Team change and paid/unpaid toggle inline on the row, optimistic so tapping through
  a queue of people at the field doesn't stall.
- Walk-in add takes a name and a phone and nothing else (D8). Identity is the phone
  (D4): an existing contact with that number is reused, not duplicated.
- Waiver shows **Override** in amber when the ✓ is only an admin tick with no document
  behind it. 39 of 57 contact waivers are that today (§2) and a plain ✓ would hide it.

**Known gap:** `registrations` still has NOT NULL on email, dob, emergency_name and
emergency_phone, so a walk-in is written with placeholders (`@walk-in.hps.local`,
`1900-01-01`, empty strings) and the row is marked "Needs details". B3 removes the need.

### A4. In-person waiver signing (D8) — ✅ code complete, needs one live run
**"Sign now"** on any Roster row whose waiver is not a real document — both missing waivers
and the amber Override rows, since replacing a ticked box with a signature is the whole point.
Opens DocuSeal embedded in a modal (with an "open in a new tab" escape hatch, because
embedding can be refused and the owner must never be stuck), `send_email: false`.

**"Done — check" asks DocuSeal directly rather than waiting for the webhook.** At the field
the ✓ has to appear while the player is still standing there; a webhook that is delayed,
blocked or misconfigured would leave the owner staring at a red ✗ next to someone who just
signed.

**Root cause of the missing documents, fixed.** §2 records 104 registrations with a DocuSeal
submission, 97 marked signed, and `waiver_document_url` NULL for every one. The reason is in
the code: `/api/admin/sync-waivers` **never wrote the column at all**. There were three copies
of "record a signed waiver" (webhook, sync-waivers, register) and they had drifted. All three
now go through `recordSignedWaiver` in `src/lib/waiver-capture.ts`, which writes the document
link in the same statement as the signed flag. A waiver you cannot produce is not a waiver.

**Still to verify:** no DocuSeal call has ever been made by this code. All four `DOCUSEAL_*`
vars are empty in `.env.local`, so nothing DocuSeal-dependent is reachable locally. Missing
config degrades to a clean 503 and the modal shows it rather than breaking. **Also confirm
`DOCUSEAL_WEBHOOK_SECRET` is set in production** — if it is not, the webhook has been
returning 503 to every callback, which would be the second half of why no documents were ever
captured.

### A5. Legal pages (D10) — ✅ written and linked, ⚠ NOT yet reviewed
`/privacy`, `/terms`, `/refunds`, `/cookies`, all four linked from the footer, and the public
`/admin` link removed from it.

Written from what the code actually does, not from a template: the data list matches the
registration form field for field, the processor list is the four services really in use
(Supabase, Stripe, DocuSeal, Vercel), and the cookie notice is short because the site sets
only `sb-*` and `admin_token` and loads no third-party tracking scripts at all — there is
genuinely nothing else to disclose.

**Operator decisions baked in as defaults — change these if they are wrong:**

| Where | Value chosen |
|---|---|
| Privacy → retention | Payments kept 7 years; waivers kept while a claim is possible |
| Terms → governing law | Texas; venue Harris County |
| Terms → liability cap | Amount paid for that event |
| Refunds → player cancels | Full refund >7 days before the first match; credit inside 7 days; none once started |
| Refunds → team withdrawal | Not refundable once the schedule is published |
| All pages | Trading name "Houston Premier Soccer" — no registered legal entity name is used anywhere |

**Done when the operator has had them reviewed.** They are published as real pages, not
drafts, so a lawyer's pass is the remaining step — this is not legal advice.

---

## Track B — after the season is running

### B1. Data cleanup
Delete the 6 test rows and team `RED`; merge the 3 duplicate humans; resolve the 37 orphan
registrations and 6 unlinked payments. Normalize every phone to E.164 and add the unique
index. **Back up first; this is destructive.**

### B2. Event kinds (D6, D7)
Add `kind`, `guest_fee_cents`, `door_fee_cents`, `guests_free_for_active_players`. Open-play
events stop rendering team/standings UI. Implement the "free if on an active tournament
roster" rule.

### B3. One roster table (D3, D7) — the big migration
Create `roster_entries`; backfill from `registrations` and `drop_ins`; repoint `payments`;
drop `team_members`, `drop_ins`, and `registrations.team_name`.
**Backfill and verify in a branch. Do not run this against production without a snapshot.**

### B4. Waiver integrity
Backfill all 104 `waiver_document_url` values from DocuSeal (there is already a
`/api/admin/sync-waivers` route to build on). Surface real expiry dates. One-click resend.

### B5. Auth: Google + Apple only (D4, D5)
Remove magic-link and password sign-in and their pages (`/login/forgot-password`,
`/auth/reset`, `/me/security`, `ClaimAccountForm`, `PasswordForm`, `MagicLinkForm`). On first
sign-in, ask once for a phone number and link to the existing person. Keep `auth_user_id` on
`people`.
**Only 5 accounts have ever signed in, so migration risk is low — but notify those 5 first.**

### B6. Admin consolidation + plain English
Merge `/admin/tournaments/[id]` and `/admin/tournaments/[id]/edit` into one page (Teams and
Match Scores currently sit on *different* pages). Delete the "Manage" cards that duplicate the
nav. Fix the dashboard showing **$0.00 revenue on load** (payments only load when the Payments
tab is clicked, but the header computes totals immediately). Relabel: "Drop-ins" → "Guest
players", "Merge INTO the selected winner" → "Keep this one", and so on. Implement D2.

### B7. Public site
Mobile spine (action bar on every page; 13 pages currently reserve 80px for a bar that only
renders on the homepage; the WhatsApp button overlaps content). Tournament tabs (491px of tabs
in a 327px container — "Top Scorers" is invisible and the standings **Points column is cut
off**; rebuild standings as cards on mobile, put tab state in the URL, merge the duplicate
Schedule/Results tabs). Past-event archive. Homepage above-the-fold rework. Remove the
hardcoded `world-cup-standings.ts` override once real scores are trusted.

---

## 6. Key flows to build against

**Returning player, signed in (D5):**
Google/Apple sign-in → recognized → *"Waiver good through 2027-03-14"* → pick team → pay. No
waiver step.

**New player online:**
Name + phone + team → waiver (once, 365 days) → pay.

**Walk-in at the field (D8):**
Owner opens Roster → Add player (name + phone) → "Sign waiver now" on the laptop → mark paid
or text a pay link.

**Guest filling in for a team (D7):**
Added to the roster as `role='guest'` for one round, charged `guest_fee_cents`.

**Open-play night (D6, D7):**
Attendance list. Free if the person is on an active tournament roster, otherwise
`door_fee_cents`.

---

## 7. Already shipped

**Phase 0 — 2026-08-12, data only.** The live site was selling entry to an Open Play held
2026-08-09, and the World Cup (ended 2026-07-17) was ranked above the live event as
"UPCOMING". A "TESTING" post was pinned publicly. All three fixed directly in the database.

**Phase 1a — 2026-08-12, code.** `src/lib/tournament-state.ts` derives whether an event is
over **from its own dates**, and every money and signup path now gates on it: Stripe checkout
(both tournament and drop-in), pay eligibility, pay options, pay-by-slug, registration,
homepage featured, and the archive.

The property that matters: **it is fail-safe.** Even if `payments_open` is left on forever, a
past event refuses to sell. Events stay live for the whole of their final day in Houston time,
so a tournament running tonight still takes money.

Side effect: the "Recent Events" archive now fills itself from dates, with nobody marking
anything completed.

Tests: `npx tsx scripts/test-tournament-state.ts` — 8 cases including the exact Aug-9 row and
the 10pm-on-game-night edge case. Typecheck and `npm run build` both pass.

> ⚠ **Phase 1a is committed but was not deployed at the time of writing.** Production is safe
> only because Phase 0 fixed the data by hand. The protection does not exist live until
> deployed.

**Phase 1b — 2026-08-12, code + one migration.** A1 done. The tournament form now has a single
**Event status** dropdown — Draft / Open / Closed / Cancelled — and the owner cannot build a
contradictory combination, because `status`, `registration_open` and `payments_open` are
derived from that one choice in exactly one place and are no longer separately editable.

- **Finished is never offered and never stored.** When the dates say the event is over the
  section renders a locked "Finished — ended <date>" card, recomputed from the dates *in the
  form* so correcting a wrong end date unlocks it without saving. Saving a finished event
  omits all four state columns from the payload, so editing a past event cannot write
  "finished" into the database by accident.
- **`status` is derived from the dates** (`deriveStoredStatus`), and never returns
  `'completed'` — that value is `finished`, which `displayStatus` derives for the public.
- **Draft is real**, backed by the one new column `tournaments.is_draft`. Nothing in the schema
  could hide an event before this: `getPublicTournaments` returned everything except
  `status = 'cancelled'`. Drafts are now excluded from every public listing, 404 on their own
  slug, cannot be featured, and take no money. The migration also narrows the public RLS read
  policy from `using (true)` to `using (is_draft = false)`.
- **Cancelled stays** as a fourth choice. It exists today, reads differently to the public than
  Draft, and `tournament-state.ts` already handled it.
- Slug, Register URL, Pay URL and Display Order moved behind an **Advanced** disclosure that
  force-opens if one of them fails validation. "Show on homepage" is a star beside the
  dropdown, disabled while Draft (enforced in the API too).
- The admin list and detail page now show **one derived state badge** via
  `EventStateBadge`, replacing the Status / Reg / Pay trio that could disagree with each other
  and with the calendar at the same time.

`is_draft` is a *required* field on `StatefulTournament` deliberately: the compiler then
located all six money and signup paths whose explicit `.select()` lists needed it, instead of
letting them silently fail open.

Tests: `npx tsx scripts/test-tournament-state.ts` — now 16 cases (draft precedence, a draft in
the past, cancelled outranking draft, and five for `deriveStoredStatus`). Typecheck, lint and
`npm run build` all pass.

> ⚠ **Apply the migration before deploying this.** See A1 above.

---

## 8. Picking this up cold

```bash
npm install
cp .env.example .env.local     # fill in; see below
npm run dev                    # http://localhost:3000
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` (the service-role key is required for almost every page — nearly
all reads go through `supabaseAdmin`). Stripe, DocuSeal and admin values are only needed for
those specific flows.

**Stack:** Next.js 15 App Router, React 19, Supabase, Stripe, DocuSeal. Player auth =
Supabase. Admin auth = HMAC cookie.

**Orientation:**

| Where | What |
|---|---|
| `src/lib/tournament-state.ts` | Event state + the date backstop. **Read this first.** |
| `src/lib/tournaments.ts` | All public tournament queries |
| `src/lib/types.ts` | Every domain type |
| `src/lib/pay-eligibility.ts` | Waiver/payment gate logic |
| `src/components/register/RegistrationForm.tsx` | Signup (A2 changes this) |
| `src/components/admin/RegistrationsList.tsx` | 48KB — the current roster UI, A3 replaces it |
| `src/app/admin/tournaments/[id]/` | The View/Edit split described in B6 |
| `supabase/migrations/` | Timestamped migrations (loose `.sql` files in `supabase/` are legacy) |

**Verify before claiming anything works:**

```bash
npx tsc --noEmit
npx tsx scripts/test-tournament-state.ts
npm run build
```

`FOLLOWUPS.md` is an append-only log of known issues — check it before assuming something is a
new discovery.

---

## 9. Open questions

- Exact guest and door prices for Community Cup (owner to set).
- Whether Apple Sign In is still correctly configured — its client secret is a JWT that
  expires roughly every 6 months (see `docs/AUTH-RUNBOOK.md`).
- Whether the World Cup standings override can be retired, or the flyer's table is considered
  canonical permanently.
