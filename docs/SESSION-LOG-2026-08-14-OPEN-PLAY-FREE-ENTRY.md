# Session log — 2026-08-14 (sixth session): open play gets free entry, and a guest list

**Read [`docs/REBUILD-PLAN.md`](./REBUILD-PLAN.md) first, then this file.** It follows
[`docs/SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md`](./SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md),
the confirm gate and the nine-way duplicate fix earlier the same day.

`main` @ **`ecb73df`**, pushed and deployed. Community Cup starts **2026-08-21 — 7 days out.**

This session began as a verification pass over work done in a chat session (not Claude Code),
which the operator worried had been lost. Nothing was lost: the edits were on disk the whole
time. The pass turned into shipping D7 end to end, plus a follow-up fix.

---

## 1. The two lessons worth keeping

Both are the kind that pass every local check and only show up in production.

### 1a. An **additive** migration broke the **already-deployed** code

The usual instinct is "apply the migration before deploying the code, or the new code 42703s
on a column that isn't there." That was true here for `free_entry_tournament_ids`. It was also
**the wrong risk to worry about**, because the second migration adds
`registrations.free_entry_tournament_id` — the **second FK from `registrations` to
`tournaments`** — and the moment it lands, PostgREST refuses to disambiguate any `.select()`
that embeds `tournaments(...)` from `registrations`. Six such call sites were live in
production at the time (`/pay`, `/me`, the waiver signing screen, admin Registrants,
`/api/registrations/[id]`, captain paid-ack).

So the migration was not backward compatible with the running code, even though it only
*added* things. The correct framing:

> A migration that adds a second relationship between two tables is a **breaking** change to
> every existing embed between them, in both directions of deploy order.

**How it was handled:** the constraint-naming fix was committed *with* the feature, both
migrations applied, and `main` pushed immediately. That leaves a window equal to the Vercel
build (~60s) where old code ran against the two-FK schema. The operator accepted that window
explicitly rather than it being taken silently. **Zero 5xx were recorded across it** — verified
after the fact via Vercel runtime logs, not assumed.

There was a genuinely zero-downtime path available and it is worth knowing for next time:
**deploy the constraint-naming fix alone first** (naming `registrations_tournament_id_fkey` is
valid against a one-FK schema too), *then* apply the migration, *then* deploy the feature.
Two deploys, no window.

### 1b. "Correct" and "delivered" are not the same thing

D7 was verified as correct — 29-case branch test, clean `tsc`, clean build, every call site
audited — and reported as done. It was correct. It was also **half-delivered**, and the
operator found the other half within minutes of turning it on:

> *"even tho my payment is waived on the open play i cant just sign up saying oh for u its free"*

The server comped entitled players properly. The signup screen never said so: it showed
"Door price: $15.00" and made them answer *"How are you paying?"* by choosing between two
options that both named a fee they did not owe. The comp only appeared *after* Confirm.

Nobody was ever overcharged. But a player who cannot tell they are comped budgets $15 and
turns up expecting to hand it over — which is most of the value of comping them. **A money
decision that is right but silent is not finished.**

---

## 2. What D7 actually decides

An open-play night names, per event, which tournaments get in free. It is **configuration,
not a standing rule** — the plan's literal wording ("free if they are on an active tournament
roster") would mean the day somebody creates a fourth tournament, its players start walking
into Fridays free and nobody decided that.

You get in free if you hold a live spot on a named tournament: **not cancelled, assigned to a
team, and not refunded.**

| Choice | Why |
|---|---|
| `team_id IS NOT NULL` required | An abandoned half-finished signup for an $80 tournament would otherwise buy free Fridays forever. Being on a team is where the owner actually counted you in. |
| `payment_method` **never read** | It is NULL on three of four live Community Cup rows, **including both players who paid $80 by card**. A rule reading it would charge $15 at the door to people who already paid — the worst outcome this feature can produce. |
| `waived` counts as qualifying | Those are the people the owner **personally comped**. Excluding them would charge exactly the players he decided to let in free. No row is in that state today, which is why it was worth fixing before one is. |
| `partial` does **not** qualify | Unused in production, and "paid us something once" is a weaker claim than the owner having actively waived the fee. |
| Empty config = nobody comped | The default. Every event that exists keeps charging what it charges today. |

⚠ **The rule is simple enough to reproduce from the shipped JS bundle.** A client-supplied
"I'm free" flag would therefore be forgeable free entry. The decision is made server-side in
`resolveOpenPlayEntitlement()` from rows the caller does not control, and
`/api/register/join` re-derives it at write time. **That is the only binding answer.**

---

## 3. Code shipped

### 3a. The rule — `src/lib/open-play-free-entry.ts` (new)

Pure, no database, so its branch table is testable: `scripts/test-open-play-free-entry.ts`,
**29 cases**, including the two that drove the design (NULL `payment_method` card payers, and
owner-comped `waived` players). Waiver validity is checked **before** entitlement — a comped
regular with a lapsed waiver signs again before they play.

### 3b. The database half — `src/lib/open-play-attendance.ts` (new)

`loadOpenPlayEntitlement()` reads the rows and feeds the pure rule. **Fails closed**: a
database error logs and returns `must_pay`, because a player can be let in manually at the
field but an unauthorised comp cannot be taken back. Short-circuits without querying when the
night has no free-entry tournaments configured, which is every event by default.

### 3c. The guest list — `public.open_play_attendees(uuid)`

Surnames are truncated **in SQL**, not in the component. Rendering only the initial from a
full-surname payload would leave full names in the RSC payload and anyone's network tab — a
list that looks private while being nothing of the sort. Hard-scoped to `kind = 'open_play'`
in the function body so a tournament roster can never be published through it, and revoked
from `anon`/`authenticated` as belt-and-braces.

This is the **one** place `kind` is allowed to gate anything, and it gates *disclosure*, in
the fail-closed direction. `lib/event-kind.ts` still forbids `kind` from gating money,
sign-ups or visibility, because those must fail open.

### 3d. Recording *why* — `registrations.free_entry_tournament_id`

Recorded at signup, **not recomputed**. The config on the open-play event can change
afterwards, and when somebody disputes a comp at the field the answer has to be what was true
when they signed up. Set together with `payment_status = 'waived'`.

### 3e. The follow-up fix (`ecb73df`) — saying it out loud

`loadOpenPlayFreeEntry()` answers the same question one screen earlier and resolves the
conferring tournament's **title** — "you're on the Community Cup roster" settles a question at
the field; a UUID does not. In `QuickJoinCard`:

- the free notice **replaces** the door price rather than sitting beside it (showing both
  states the thing they don't owe more prominently than the thing that's true)
- **"How are you paying?" disappears entirely** when free — it was a question with no true
  answer and both radios named the wrong number

⚠ This new call is a **display hint** and is documented as one in the code. It runs against
the roster as of one page load ago and the browser could lie about having seen it.
`/api/register/join` remains the sole authority on what anyone is charged.

---

## 4. State of production

`main` @ `ecb73df`, deployed, aliased to `www.houstonpremiersoccer.com`.

**Migrations applied** — note the version mismatch:

| Local file | Recorded in Supabase as |
|---|---|
| `20260815030000_add_open_play_free_entry_config.sql` | `20260814211133` |
| `20260815031000_open_play_attendance_and_free_entry.sql` | `20260814211247` |

They were applied through the Supabase MCP tool, which stamps its own version. **A
`supabase db push` will therefore try to apply both local files again** — the same quirk
already true of `20260815001500_dedupe_registrations_and_guard.sql` (recorded as
`20260814185600`). All three are idempotent (`add column if not exists`,
`create or replace function`, and a dedupe whose `rn > 1` set is empty once deduped), so a
re-run is a no-op. Don't be alarmed by it; don't rely on it for a future migration that isn't
written that way.

**Live config:** the Open Play row (`465f52e5-…`) now lists Community Cup
(`5bb92b95-…`) in `free_entry_tournament_ids`. Door price `entry_fee_cents = 1500`.

---

## 5. Verified vs assumed

**Verified:**
- `tsc` clean, **90/90** across the five test scripts, `npm run build` passes
- Both columns, the FK, and the function confirmed present in production by direct query
- `registrations` now has **exactly two** FKs to `tournaments`, named
  `registrations_tournament_id_fkey` and `registrations_free_entry_tournament_id_fkey` —
  character-for-character what the seven rewritten call sites hardcode. Had either name
  differed, all of those pages would be broken.
- All seven `registrations → tournaments` embeds name their constraint. The two unqualified
  embeds remaining in the codebase read from `payments` and `drop_ins` (single-FK, safe).
- Live probes after both deploys: homepage, `/events`, both event pages, `/register`,
  `/register?tournament=<open play>`, `/pay` — **all 200**
- **Zero runtime errors and zero 5xx** across the whole migration + deploy window
- The rule fires for a real entitled player: the operator's own Community Cup row (`paid`,
  team assigned, not cancelled) satisfies `findQualifyingRegistration` against the live config

**Assumed / not verified:**
- ⚠ **The rendered free-entry card has never been seen.** `QuickJoinCard` only renders for a
  signed-in player with a valid waiver, and no automated check here can hold a Google session —
  the same limitation every prior session recorded. The *logic* is verified against live rows
  and by the branch test; the *pixels* are not.
- No open-play signup has been completed end to end, so no row has yet been written with
  `payment_status = 'waived'` + `free_entry_tournament_id` set. The write path is code-reviewed
  and type-checked, not exercised.
- The admin Roster's "why is this person free" column is likewise unexercised — it has no rows
  to display yet.

---

## 6. Open items

1. **Assign Community Cup teams before Friday.** Free entry requires `team_id IS NOT NULL`.
   Anyone signed up but not yet on a team **pays the $15**. That is the deliberate rule, not a
   bug — but it means unassigned players get charged, and the remedy is admin work, not a code
   change.
2. **The Open Play row's slug is still `open-play-july-27-28-2026`** on an event titled
   "Friday August 14th". Pre-existing, already in FOLLOWUPS, untouched by this session.
3. **Complete one open-play signup end to end** as an entitled player, and confirm the row
   lands `waived` with `free_entry_tournament_id` populated. This is the single highest-value
   check left and needs a human with a Google session.
