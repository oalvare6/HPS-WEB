# Stage 2.0 — Event state: one source of truth

**Date:** 2026-09-10. **Branch:** `claude/event-state-source-of-truth-5eztx6`. **Not deployed, not
merged.** No migration, no schema change, no production row touched. The only production access
was read-only `SELECT`s against `tournaments`, `tournament_rounds`, `matches` and `site_settings`
to confirm the shapes described below.

**Read after** [`backend_audit_v1.md`](../backend_audit_v1.md) §4 and F-03, which found the
problem, and [`REBUILD-PLAN.md`](REBUILD-PLAN.md) §3 D1, which decided the vocabulary this stage
finishes implementing.

---

## 0. The one-paragraph version

The money and sign-up gates had derived an event's state from its dates since Phase 1a. The
display never did: five surfaces read the stored `status` column and the raw
`registration_open` / `payments_open` flags, and nothing rewrites those between saves. So on
2026-09-09 one production row rendered as **"Ongoing — Registration & Payments Open"** with a
**"Sign up to play"** button on `/events`, **"Completed"** in the homepage archive, and **"Past
event"** in its own CTA card, while `/register` correctly said closed. Every surface now reads one
resolver, `resolveEventView` in `src/lib/tournament-state.ts`, whose `canRegister` / `canPay` **are**
the gate functions, so a page cannot advertise a door the backend will refuse. The admin's one
dropdown is now the only writer of the four state columns, on the API as well as in the form.

---

## 1. The old architecture

```
                 tournaments row
   ┌───────────────────────────────────────────────┐
   │ status  is_draft  registration_open           │
   │ payments_open  start_date  end_date  is_featured
   └───────────┬───────────────────────┬───────────┘
               │                       │
   MONEY / SIGN-UP GATES               DISPLAY
   tournament-state.ts                 (five files, five formulas)
   resolveEventState(t, now)           /events sort ............ STATUS_SORT[t.status]
     cancelled > draft >               TournamentCard strip .... STATUS_PILL[t.status] + raw flags
     completed-or-past > flags         FeaturedTournamentCard .. STATUS_PILL[t.status] + raw flags
   acceptsRegistrations(t)             /events/[slug] header ... STATUS_PILL[t.status] + raw flags
   acceptsPayments(t)                  /events/[slug] CTA ...... derived (isFinished only)
        │                              homepage hero .......... raw registration_open
        │                              homepage archive ....... recentEventStatus(t.status)
        ▼                              card CTA ............... tournamentPrimaryCta(raw flags)
   /api/register, /api/register/join,  /me current vs past .... tournament.status
   /api/stripe/checkout, /api/pay/*,   featured fallback ...... status in ('upcoming','ongoing')
   /pay, /register, resume routes      hero status dot ........ hardcoded default "Registration Open"
```

Two vocabularies, one row. The left column was fail-safe by design (a past event refuses to sell
even with its flags left on). The right column was whatever the row said on its last day.

### What production looked like on 2026-09-10 (read-only)

| Event | stored `status` | reg / pay flags | dates | derived | what the site showed |
|---|---|---|---|---|---|
| Community Cup | `upcoming` | true / true | 08-21 → 10-23, in play since 08-21 | **open, in progress** | "Upcoming" on the homepage, `/events` and its own header |
| Open Play Aug 14 | `ongoing` | true / true | 08-14 | **finished** | "Ongoing — Registration & Payments Open" + "Sign up to play" on `/events`; "Completed" in the archive; "Past event" in its own CTA |
| World Cup | `completed` | false / false | 06-08 → 07-17; rounds to **07-31** | finished | correct today; was "finished" for two weeks while the semis and final were still to play |
| Memorial Day | `completed` | false / false | 05-25 | finished | correct |

`site_settings` has no `home.status_pills` row, so the hero and the header rendered the code
default: `[{ "Registration Open" }, { "Fields: Open" }]` — a hardcoded claim about event state.

## 2. Root causes of the disagreement

1. **`status` is never rewritten when an event ends.** D1 says finished is derived and never
   stored, so `deriveStoredStatus` never returns `completed`, and the column is only touched when
   the owner saves the form. A finished event's stored status is therefore whatever it was on its
   last day (`ongoing` for the Aug-14 night), and a season in progress stays `upcoming` until
   somebody saves it.
2. **The presentational readers were never migrated to the derived state.** Phase 1a moved every
   money and sign-up path onto `tournament-state.ts` and left the cards, headers, sort and archive
   badge reading the columns. Each had its own formula (`STATUS_SORT`, three `STATUS_PILL` tables,
   `statusLabel`, `recentEventStatus`, `isUpcomingStatus`), so they also disagreed with each other.
3. **The flags were read raw for display.** `registration_open` was true on a finished event, so
   `tournamentPrimaryCta` offered sign-up, the homepage hero offered "Sign up now", and the header
   badges said "Registration Open" — all leading to a screen that said closed.
4. **The admin API was a second writer.** `PATCH /api/admin/tournaments/[id]` accepted `status`,
   `is_draft`, `registration_open` and `payments_open` individually, so the form's one dropdown
   (A1) was the usual writer, not the only one.
5. **One claim was hardcoded.** The hero's "Registration Open" dot was a default in
   `site-settings.ts`, independent of every event.

## 3. The new authoritative model

Everything lives in `src/lib/tournament-state.ts`. The gate functions are unchanged; a second layer
projects them onto everything a surface is allowed to say.

```
storedEventState(t)        the operator's choice read back from the columns
                           cancelled > draft > open (either flag) > closed
resolveEventState(t, now)  the operator's choice with the calendar backstop
                           cancelled > draft > finished (stored 'completed' OR past by dates) > open | closed
eventPhase(t, now)         calendar only: upcoming | in_progress | finished
acceptsRegistrations(t)    state === open && registration_open      (the sign-up gate, unchanged)
acceptsPayments(t)         state === open && payments_open          (the money gate, unchanged)
displayStatus(t, now)      public pill vocabulary: cancelled | completed | ongoing | upcoming — derived
storedColumnsFor(state, dates)   the dropdown expanded into the four columns; the ONLY writer
resolveEventView(t, now)   the snapshot every surface reads
sortEventsForListing(rows) the /events order, from the snapshot
```

`EventView`:

| Field | Meaning | Derived from |
|---|---|---|
| `state` | draft / open / closed / finished / cancelled | `resolveEventState` |
| `storedState` | the operator's choice before the calendar | `storedEventState` |
| `phase` | upcoming / in_progress / finished | dates only |
| `status`, `label` | public pill: Upcoming / Ongoing / Completed / Cancelled | `displayStatus` |
| `stateLabel` | admin badge text | `EVENT_STATE_LABELS` |
| `availability` | open / pay_only / closed | `canRegister`, `canPay` |
| `canRegister`, `canPay` | **identical to the gates** | `acceptsRegistrations`, `acceptsPayments` |
| `isVisible` | own page may render (only the draft flag hides) | `is_draft` |
| `isListed` | may appear in a public list | visible and not cancelled |
| `bucket` | upcoming / current / past / hidden | state + phase |
| `headlineEligible`, `isFeatured` | may headline; starred and may headline | listed, not finished, `is_featured` |
| `happeningToday`, `lastDay` | for `/me` and the schedule check | dates |

### Precedence, and what the calendar may decide

- **Cancelled** and **Draft** are explicit operator states and outrank the calendar in both
  directions. A draft in the past is still a draft, not archive material. A cancelled draft reads
  as cancelled but stays hidden — the draft *flag* hides, matching `getTournamentBySlug` and the RLS
  policy.
- **Finished** is derived from the headline dates (end date, else start date; live through the
  whole of the last day in Houston time), or honoured from a hand-set `status = 'completed'`. The
  form never writes that value; Phase 0 wrote it by hand on two rows and an operator who marks
  something completed means it.
- **Open** requires the operator to have chosen Open. The calendar only ever takes selling away;
  it never grants it. The invariant matrix in `scripts/test-event-state.ts` proves
  `canRegister ⇒ registration_open` and `canPay ⇒ payments_open` for every combination.
- **The schedule does not extend the event.** A round dated after `end_date` does not keep the
  event live; that would loosen the money gate from a second data source. Instead
  `scheduleOverrunDay()` in `lib/schedule.ts` reports the mismatch and the admin Schedule tab says
  so in plain words (§6, case 7; business question in §11).

### Where the words live

Each pill table now carries styles only; the text comes from `view.label` / `view.stateLabel`.
`availability` decides the "Registration Open" / "Payments Open" badge on every surface, so the
detail page no longer shows both at once (it used to show "Payments Open" beside "Registration
Open"); the one front door (§A6) means "Registration Open" already implies paying is possible.

## 4. Routes and components migrated

| Surface | Before | Now |
|---|---|---|
| `/` hero link + button | `heroTournament.registration_open` | `resolveEventView(hero).canRegister` |
| `/` Featured Events | pinned filtered by `!isPastEvent`; fallback `status in ('upcoming','ongoing')` | pinned filtered by `view.isFeatured`; fallback by `view.headlineEligible` (no stored-status filter) |
| `/` Recent Events badge | `recentEventStatus(t.status)` | `recentEventStatus(view)` — always Completed for the archive |
| `/` hero status dots | hardcoded default "Registration Open" | derived in `lib/status-pills.ts` from the same loader `/register` uses; operator pills follow |
| `/events` order | `STATUS_SORT[t.status]` | `sortEventsForListing` (bucket, then date) |
| `TournamentCard` strip + CTA | `STATUS_PILL[t.status]`, raw flags, `statusLabel` | `view.status/label/availability`, `tournamentPrimaryCta` (now resolver-backed) |
| `FeaturedTournamentCard` | same as above | same as above |
| `/events/[slug]` header pills | `STATUS_PILL[t.status]`, raw flags, `status !== 'completed'` | `view.status/label/availability` |
| `/events/[slug]` CTA card | `viewerEventCta({ isFinished })` | `viewerEventCta` resolves the event itself; cancelled and closed handled |
| `/events/[slug]` D7 "Free for … players" line | shown on a finished night | gated on `view.canRegister` |
| `/register` | `acceptsRegistrations` (already derived) | `resolveEventView`; `ClosedCard` says *why* (ended / called off / not open) |
| `/register` for a pay-only event | full form for a stranger, then `/api/register` refused | `closed` — the card CTA sends them to `/pay`, and the two agree |
| `/me` current vs past registrations | `tournament_status` (stored) | `tournament_state` via `resolveEventState` in `getPlayerProfileData` |
| `/me` "What's next" | `viewerEventCta({ isFinished })` | resolver inside `viewerEventCta` |
| `tournamentPrimaryCta`, `viewerEventCta` | raw flags | `resolveEventView`; a finished, cancelled or closed event returns no button whoever is looking |
| `getPublicTournaments` | SQL filter only | SQL filter + `view.isListed` |
| `getRecentEvents` | `resolveEventState === 'finished'` | `view.bucket === 'past'` |
| `EventStateBadge` (admin) | `resolveEventState` | `resolveEventView`; reads "Open · in progress" for a season under way |
| `TournamentForm` (admin) | own copy of the stored-state ladder; expanded the dropdown into four columns client-side | `storedEventState`; sends `state` |
| `POST` / `PATCH /api/admin/tournaments` | accepted `status`, `is_draft`, `registration_open`, `payments_open` individually | accept `state` only, expanded through `storedColumnsFor`; the four columns are dropped from the allowlist |
| `SchedulePanel` (admin) | — | amber note when the schedule runs past the event's end date |
| `/api/register` | an explicit event that is not accepting sign-ups fell through to "the single open event" or a registration with **no event** | 400 `{ reason: "closed" }`, the same answer `/register` shows |
| `header.tsx` | operator pills, default led with "Registration Open" | operator pills only; the default no longer claims registration state (it is baked into static pages at build) |

Deleted as replaced: `STATUS_SORT` and `sortEventsForList` (`/events`), `statusLabel` and the
text fields of the three `STATUS_PILL` tables, `recentEventStatus(status)`, `isUpcomingStatus`,
the form's own `storedStateFrom` ladder, `resolveTournament` / `ResolvedTournament` (unused),
`TOURNAMENT_STATUSES`, `parseTournamentStatus` and `assertTournamentStatus`.

## 5. Relationship to the backend gates

Nothing about the gates changed. `acceptsRegistrations` and `acceptsPayments` are the same two
functions, called from the same places: `/api/register`, `/api/register/join`,
`/api/stripe/checkout` (tournament and drop-in), `/api/pay/eligibility`, `/api/pay/options`, the
resume routes, the admin drop-in pay link, `/pay` and `/register`. Stripe settlement
(`finalize_checkout_payment`) was not touched.

What changed is that the display is now **derived from those functions rather than approximating
them**: `resolveEventView` calls them and every card, badge, CTA and list bucket is a projection of
the result. The property this buys is stated as an invariant and checked over 160 rows:

> the frontend can never advertise more than the gates allow, and it cannot loosen them — a
> surface only ever has `canRegister` / `canPay` that are equal to the gate's own answer.

Two backend paths were tightened because the display now exposes what they did:

- `/api/register` refuses an explicit event that is not accepting sign-ups (400, `reason:
  "closed"`) instead of quietly attaching the registration to another event or to none.
- `resolveSignupState` answers `closed` for someone not on the roster when sign-ups are closed,
  even if payments are open — the pay door serves people already on the roster, and the card CTA
  already sent strangers to `/pay`.

## 6. Edge cases

All in `scripts/test-event-state.ts` section A, with the pinned clock 2026-09-10 10:00 Houston.

| # | Case | Row | Result |
|---|---|---|---|
| 1 | Future event before registration opens | Closed, dates in November | `closed`, Upcoming, no badge, no CTA, listed under upcoming |
| 2 | Future event, registration open | Open, November | `open`, Upcoming — Registration Open, sign-up CTA |
| 3 | Registration closed, not started, payments open | reg false / pay true | `open`, availability `pay_only`, card CTA is the pay door, `/register` says closed to strangers, owes-payment players still see their card |
| 4 | Currently active | Community Cup shape: stored `upcoming`, 08-21 → 10-23 | `open`, phase in_progress, **Ongoing**, bucket current, featured, admin "Open · in progress" |
| 5 | Completed | Aug-14 shape: stored `ongoing`, both flags on | `finished`, Completed, no badge, no CTA, `/register` "has already happened", archive |
| 6 | Cancelled / draft, flags on | `status=cancelled`; `is_draft=true` | cancelled: label Cancelled, hidden from lists, own page reachable, no CTA. draft: hidden everywhere, 404 |
| 7 | Schedule dates beyond the headline end date | World Cup shape: ends 07-17, semis 07-24, final 07-31, viewed 07-25 | `finished` by the headline date, nothing sells; `scheduleOverrunDay` = 07-31 and the admin Schedule tab shows the note; a cancelled round after the end date does not count, a rescheduled one counts on its new date |
| 8 | Capacity reached | `max_teams: 1` | unchanged: `max_teams` caps *teams* and nothing in the backend enforces it against sign-ups, so the display must not invent a closed state the API would not honour (§11) |
| 9 | Admin override | stored `completed` + future dates; owner chose Closed on a season in progress; cancelled + draft; draft in the past | finished honoured; "Closed" to the admin and "Ongoing" to the public with nothing on offer; cancelled outranks draft; a past draft stays draft |
| 10 | Historical tournament | World Cup, starred, months past | Completed, browsable (`/events` archive, own page with hub), never the hero |
| 11 | Current featured event | Cup starred; an open play tonight starred | `isFeatured`, hero + Featured Events; "happening today" |

The four guarantees the brief asked for:

- **Completed events cannot appear open unless explicitly intended.** `isFinished ⇒ !canRegister
  && !canPay` over the whole matrix, and the only way to be finished-but-selling is none: a stored
  `completed` is finished, a past date is finished.
- **Registration UI never advertises a backend-rejected state.** `card CTA register ⇔
  canRegister`, `pay ⇔ canPay && !canRegister`, and the event-page CTA offers a button only when a
  gate is open, for every row and every personal state.
- **Past events stay accessible historically.** `isVisible` is true for everything but drafts; the
  archive, `/events` and the event page (with hub) all render finished events. Only the draft flag
  404s.
- **Payment eligibility cannot be loosened by frontend state.** The frontend has no state of its
  own: `view.canPay === acceptsPayments(t)` by construction and by test.

## 7. Tests added and changed

- **New `scripts/test-event-state.ts`** — the edge cases above, a 160-row invariant matrix
  (4 stored statuses × draft × registration flag × payments flag × 5 calendar positions, 34
  invariants each, including the card and event-page CTAs and `/register`'s closed card for a
  stranger and for a rostered unpaid player), the
  stored-state round trip (`storedColumnsFor` → `storedEventState`, never writes `completed`),
  `parseStoredEventState`, the listing order, and the phase helper.
- **New `scripts/verify-event-state-pages.mjs`** — the browser-level check (§9).
- `scripts/test-event-cta.ts` — fixtures carry dates and a pinned clock; the finished case keeps
  both flags on (the production shape); a cancelled case added.
- `scripts/test-me-next-steps.ts` — same fixture change; `isFinished` argument gone.
- `scripts/test-signup-state.ts` — "valid waiver but sign-ups closed" now expects `closed` (it
  expected the full form, which `/api/register` would have refused); a stranger and an
  on-the-roster case added for the pay-only shape.

Add to the verification list in `CLAUDE.md`:

```bash
npx tsx scripts/test-event-state.ts
npx tsx scripts/test-event-cta.ts
npx tsx scripts/test-me-next-steps.ts
node scripts/verify-event-state-pages.mjs --build   # headless Chromium against a fixture stub
```

## 8. Test totals

Run on 2026-09-10 from a clean `npm ci`, Node 22.22.2. The two PostgreSQL-backed suites booted
their own PostgreSQL 16 cluster (`scripts/_pg.ts`, as the packaged `postgres` user).

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | no warnings or errors |
| `npm run build` | compiled, 45 pages |
| `test-tournament-state` | 16/16 |
| `test-signup-state` | 20/20 (was 18; two cases added, one expectation changed — §7) |
| `test-roster-totals` | 12/12 |
| `test-canonical-host` | 15/15 |
| `test-open-play-free-entry` | 29/29 |
| `test-standings` | 15/15 |
| `test-schedule` | 14/14 |
| `test-resume-access` | 41/41 |
| `test-resume-routes` | 46/46 |
| `test-payment-finalize` | 36/36 |
| `test-stripe-webhook` | 20/20 |
| `test-reconcile-payments` | 35/35 |
| `test-resend-sender` | 13/13 |
| `test-stripe-route` | 10/10 |
| `test-checkout-pricing` | 65/65 |
| `test-finalize-sql` (PostgreSQL) | 122/122 |
| `test-stripe-integration` (PostgreSQL, no `--live-sandbox`) | 90/90 |
| **`test-event-state` (new)** | **5,494/5,494** (54 edge-case checks + 160 rows × 34 invariants) |
| **`test-event-cta`** | **27/27** (was 25) |
| **`test-me-next-steps`** | **8/8** |
| `test-cancel-eligibility` | 11/11 |
| `test-waiver-reconcile` | 16/16 |
| `verify-pay-gate-t4` (static checks) | passed |
| **`verify-event-state-pages` (headless Chromium)** | **46/46** |

6,155 script assertions and 46 browser assertions, all passing. Nothing was skipped: the
PostgreSQL suites ran, and `HPS_SKIP_PG_TESTS` was not set.

## 9. Browser verification

The production Supabase host is unreachable from this environment (the egress proxy answers 403
to the CONNECT), so the pages could not be rendered against production data. Instead
`scripts/verify-event-state-pages.mjs` stands up an in-memory PostgREST on localhost with nine
fixture events laid out **relative to today** — one per state — builds the site against it, and
renders every surface in **headless Chromium** (`/opt/pw-browsers/chromium-1194`, via
`--dump-dom` with a virtual-time budget so hydration runs). Assertions are about the text a
visitor reads and the `href` each button carries.

Result: **46/46**, no console errors. What agreed, per fixture:

| Fixture (state) | `/events` strip / CTA | `/` | `/events/[slug]` header / CTA card | `/register?tournament=` |
|---|---|---|---|---|
| Cup — stored `upcoming`, in play, starred | Ongoing — Registration Open / sign up | hero "Featured tournament", **Sign up now**; dot "Registration open" | Ongoing + Registration Open / Take part → sign up; hub renders | "Sign up — Fixture Cup", form |
| Friday — stored `ongoing`, flags on, four weeks ago | Completed / none | Recent Events "Completed"; not in Featured despite the star | Completed, no badge / Past event; no "Free for … players" line | "has already happened." |
| November — future, open | Upcoming — Registration Open / sign up | — | Upcoming + Registration Open / Take part | form |
| Winter — future, closed | Upcoming / none | — | Upcoming, no badge / Take part, no button | "isn't taking sign-ups at the moment." |
| Pay-only — reg closed, pay open | Upcoming — Payments Open / **pay** | — | Upcoming + Payments Open / pay | closed card |
| Cancelled, flags on | absent | — | Cancelled / "This event has been called off." | "has been called off." |
| Draft, starred | absent | absent | **404** | falls back to the picker, draft not named |
| World Cup — stored `completed`, starred | Completed / none | Recent Events; not Featured | Completed / Past event | "has already happened." |
| Marked done — stored `completed`, future dates, flags on | Completed / none | Recent Events | Completed / Past event | "has already happened." |

Also checked: `/events` order (upcoming soonest-first, in progress, archive newest-first, per
kind section), the `/register` picker lists exactly the events taking sign-ups, and the
per-fixture agreement row (every surface advertises the same door).

What this does **not** prove: RLS, the real database, the admin screens, or a signed-in session —
nobody here can hold a Google session, the same limitation every previous session recorded. The
admin Schedule tab's overrun note and the "Open · in progress" badge were typechecked and built,
not clicked.

## 10. Files changed

**Model**
- `src/lib/tournament-state.ts` — `storedEventState`, `storedColumnsFor`, `eventPhase`,
  `eventLastDay`/`eventFirstDay`, derived `displayStatus`, `EVENT_STATUS_LABELS`,
  `EVENT_STATE_LABELS`, `EventView` + `resolveEventView`, `sortEventsForListing`,
  `parseStoredEventState`. `resolveTournament`/`ResolvedTournament` removed.
- `src/lib/schedule.ts` — `scheduleLastDay`, `scheduleOverrunDay`.
- `src/lib/tournament-public-links.ts` — `tournamentPrimaryCta` and `viewerEventCta` resolve the
  event; cancelled and closed branches; `isFinished` argument removed.
- `src/lib/signup-state.ts` — `closed` for a non-rostered person when sign-ups are shut.
- `src/lib/status-pills.ts` (new) — the derived hero dot.
- `src/lib/site-settings.ts` — default pills no longer claim registration state.
- `src/lib/tournaments.ts` — featured, fallback, recent and public lists through the view.
- `src/lib/player-auth.ts` — `PlayerRegistrationRow.tournament_state` (derived) replaces
  `tournament_status`.
- `src/lib/types.ts` — `TOURNAMENT_STATUSES` removed; `TournamentStatus` documented as the stored
  column only.
- `src/lib/tournament-api-validation.ts` — status parsers removed.

**Public surfaces**
- `src/app/page.tsx`, `src/app/events/page.tsx`, `src/app/events/[slug]/page.tsx`,
  `src/app/register/page.tsx`, `src/app/me/page.tsx`
- `src/components/shared/TournamentCard.tsx`, `src/components/shared/FeaturedTournamentCard.tsx`
- `src/components/register/SignupStatusCards.tsx` (`ClosedCard` reason)
- `src/components/layout/header.tsx` (comment; operator pills only)

**Admin**
- `src/app/api/admin/tournaments/route.ts`, `src/app/api/admin/tournaments/[id]/route.ts`
- `src/components/admin/TournamentForm.tsx`, `src/components/admin/EventStateBadge.tsx`,
  `src/components/admin/SchedulePanel.tsx`, `src/app/admin/tournaments/[id]/page.tsx`

**Registration backend**
- `src/app/api/register/route.ts` — closed event → 400.

**Tests and tools**
- `scripts/test-event-state.ts` (new), `scripts/verify-event-state-pages.mjs` (new),
  `scripts/test-event-cta.ts`, `scripts/test-me-next-steps.ts`, `scripts/test-signup-state.ts`

**Docs**
- this file, `FOLLOWUPS.md`, `CLAUDE.md`

## 11. Remaining business questions

Preserved the safest current behaviour in each; none blocks the deploy.

1. **Should the schedule extend the event?** The World Cup row ended 07-17 while its final was
   07-31, so for two weeks the site called it finished with fixtures still to play. Today the
   headline end date wins (nothing is loosened) and the admin Schedule tab shows an amber note
   asking the owner to move the end date. The alternative — last round date extends the event —
   would let a schedule edit reopen sales.
2. **Should `max_teams` close sign-ups?** It caps teams and is shown on the Teams tab; nothing
   compares it to anything at sign-up (FOLLOWUPS 2026-05-21 said the same). The display now
   deliberately does not invent a "full" state the API would not enforce. If the owner wants a
   cap, it is one gate in `acceptsRegistrations` plus a team-count input, and the display follows
   for free.
3. **Is the pay-only state (sign-ups closed, payments open) wanted?** The dropdown cannot produce
   it (Open sets both flags; A1 normalises mixed rows on the next save), but the code keeps the
   `/pay` door for it because §A6 designed it. If it is never wanted, `pay_only` and the pay
   branch of `tournamentPrimaryCta` can go.
4. **What should a rostered player see on an event the owner set to Closed?** Today: the
   event-only card ("Registration isn't open right now") — the same as before this stage. A
   "You're on the roster" card with no pay button would be friendlier; it is a copy decision.
5. **Listing order on `/events`.** Kept as it was — upcoming first, then in progress, then the
   archive — now driven by the resolver. A running season with live scores could arguably lead.
6. **The hero's registration dot is now derived** and the owner cannot type over it; the header
   shows the operator's facility pills only. If the owner wants manual control back, the setting
   still exists; the derived dot would then need a switch.
7. **A hand-set `status = 'completed'` is honoured as finished** even with future dates. Only
   Phase 0 ever wrote it. If the column should be ignored entirely, one line in
   `resolveEventState` — but then a deliberately-marked event would reopen by its dates.
8. **Cancelled events stay reachable by direct link** (they always were) and show "Cancelled" with
   no button; they are hidden from every list. Should they 404 like drafts?
9. **"Not open yet" vs "closed."** There is no `registration_opens_at`, so a future event whose
   sign-ups have not opened reads "Upcoming" with no badge — indistinguishable from one the owner
   closed. Both are correct today; a scheduled open would be a new column.
10. **The Aug-14 production row** still stores `ongoing / true / true`. The code now renders it
    correctly everywhere; the owner may still want to save it as Closed for tidiness. Not
    required.

## 12. Deployment prerequisites

- **No migration, no schema change, no new environment variable.** Every column read already
  exists; the two embeds touched (`player-auth.ts`) name their FK constraint as the CLAUDE.md rule
  requires.
- **Deploy the admin form and the admin API together** (they are one bundle, so this is
  automatic). The API now takes `state` and ignores `status` / `is_draft` / `registration_open` /
  `payments_open` in a request body. Nothing in the repository other than the form posts those
  columns; a hand-written call from outside would have to send `state` instead.
- **`home.status_pills` default changed.** Production has no stored row, so after deploy the hero
  shows a derived "Registration open" / "Registration closed" dot followed by "Fields: Open", and
  the header shows "Fields: Open". Editing the setting in `/admin/site` still works and only
  affects the operator pills.
- **Static pages rebuild their header at build time** as before; the header no longer contains a
  registration claim, so there is nothing to go stale.
- **After deploy, spot-check** `/events` (the Aug-14 night reads Completed with no button;
  Community Cup reads Ongoing — Registration Open), the homepage hero dot, and the admin Events
  list (Community Cup badge "Open · in progress"). Then open the World Cup's Schedule & scores tab
  and confirm the amber end-date note appears.
