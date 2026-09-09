# Session log — 2026-09-08 — Community Cup: scores on phones, a schedule the owner can run

Operator request, verbatim intent: get the Community Cup "up to date" from the Excel
workbook, "formatted for mobile", with "a way for us to update it so the owner can come in
and update this", simple, in the admin, "polished, rn its all messed up all over the place",
and "whenever ppl see the tournament the scores and all of that is visible, optimized for
mobile phones". Plan first, then "ok now do it push and commit everything".

Four decisions were put to the operator and answered:

| Decision | Answer |
|---|---|
| Where scores live on a running tournament | Top of the event page: at-a-glance card + Table / Matches / Scorers under the title; flyer, copy and updates below; tab in the URL |
| Stats per match | Goals and own goals only |
| Public player name | Full name |
| Spreadsheet import | Trust the match lines; ambiguous scorers as plain first names; the three wrong Round-1 rows updated in place |

## 1. What was actually wrong (audit: 4 finders, 4 verifiers, 1 critic, 3 plan reviewers)

- **The admin match form never sent `round_id`.** The API accepted it and the World Cup seed
  wrote it, but every match the owner created had `round_id = null`, so the public schedule
  showed one flat, dateless "Fixtures" bucket and the rounds panel's work never rendered once
  a match existed. Five findings bottomed out here.
- **Scores were ~3 phone screens down** the event page, behind a 4-tab strip about 490px wide
  in a 327px column ("Top Scorers" off-screen) and a standings table that overflowed with
  GF/GA hidden below `sm` (640px, wider than every phone).
- **A score saved without flipping Status to Completed was invisible** on the public page
  and excluded from the table; FOLLOWUPS:78 records nine World Cup matches in that state.
- **The table counted every completed match**, so the Exhibition and the semis would have
  rewritten the league table the night they were entered.
- Free-text scorer names already fragmented the World Cup leaderboard ("Will" 9 and
  "William" 2 on one team, "JanC"/"JC", "#7", "OG" as a player).
- Also: Schedule and Results tabs duplicated; tab not in URL; round notes and cancellations
  unrendered once matches existed; empty rounds invisible; a Supabase read error blanked the
  section silently; deleting a team silently nulled it out of every fixture and goal; a goals
  PATCH route existed with no caller; "View site" hidden on phones; stats tiles above every
  tab; Schedule tab offered on open play nights.

Production before this session: 6 teams, 40 live registrations (36 on a team), ONE round
row, three Round-1 matches that did not match the spreadsheet, zero scores, zero scorers.

## 2. Data model (migration applied to production 2026-09-08)

`supabase/migrations/20260908120000_round_counts_and_scorer_identity.sql`:

- `tournament_rounds.counts_toward_table boolean default true` — Semi-Final, Final and
  Exhibition are false. `computeStandings(teams, matches, rounds)` now requires the rounds
  and skips non-counting ones inside the function.
- `match_scorers.own_goal boolean default false` with **THE ONE RULE** in the column comment:
  `team_id` is always the team the goal COUNTED FOR; an own goal is a row on the benefiting
  team named "Own goal". Per-side tallies equal the score; the leaderboard skips own goals.
- `match_scorers.contact_id → contacts` (people, not registrations — B3 retires those ids),
  with the column's SELECT revoked from anon/authenticated (table grant replaced by a column
  list) so a stable person key never rides the browser key.
- `save_match_result(tournament, match, home, away, scorers jsonb)` and
  `clear_match_result(tournament, match)` — plpgsql, service role only, grants copied from
  `open_play_attendees`. Score + status + scorers in one transaction; a half-saved Friday
  result is now impossible rather than merely visible.

Deploy order: this file BEFORE the code (additive, defaults, every deployed read is
`select("*")`). New columns are read only through `roundCountsTowardTable()` and
`own_goal === true`, and the types are optional with the `kind` comment block, so a deploy
that races the migration degrades instead of 42703-ing.

**Not yet applied:** `20260908120100_matches_integrity_constraints.sql` (unique match number
per event; completed implies both scores). Apply after this code is deployed, so
`admin-db-errors.ts` is live to translate 23505/23514. Pre-checks are in the file header.

## 3. Library and API

- `src/lib/schedule.ts` (new, pure): `isMatchPlayed` (the one definition: completed AND both
  scores), `roundCountsTowardTable`, `groupMatchesByRound` (every round in order, empty ones
  too, then an "Unscheduled" bucket by date), `nextMatchday`, `lastPlayedRound`,
  `openRoundKeys`, `formatShortDate`, `scorerLabel`.
- `src/lib/standings.ts`: `computeStandings` as above; `computeTopScorers` returns
  `{rows, ownGoals}` over played matches only, keyed by `contact_id` when present else
  case-folded name + team, ties share a rank, playoff goals included (the tab says so).
- Tests: `scripts/test-standings.ts` (15) and `scripts/test-schedule.ts` (14), added to the
  CLAUDE.md verify block. The standings test is the real Round 1–2 data.
- Routes under `src/app/api/admin/tournaments/[id]/`:
  - `matches` POST: no scores or status accepted; server assigns `match_number`; teams and
    round verified to belong to the event; same-team rejected; date defaults from the round.
  - `matches/[matchId]` PATCH: rejects `home_score` / `away_score` / `status`; validates the
    merged row; refuses team changes on a played match.
  - New `matches/[matchId]/result` PUT (→ `save_match_result`) and DELETE
    (→ `clear_match_result`); new `matches/[matchId]/status` POST (postponed / cancelled /
    scheduled, optional new date and note; refused on a played match).
  - `goals` POST and `goals/[goalId]` PATCH/DELETE: accept `own_goal` and `contact_id`,
    require the team to be a side, scoped to the event.
  - `rounds` POST/PATCH accept `counts_toward_table`; `rounds/[roundId]` DELETE refuses when
    the round has matches; new `rounds/[roundId]/move` POST shifts the round and its matches'
    dates (matches the owner already moved individually are left alone).
  - `api/admin/teams/[id]` DELETE refuses with a counted sentence when the team is in a match
    or a scorer row.
  - `src/lib/admin-db-errors.ts` translates 23505 / 23514 / 23503 / P0001 / P0002 / 42703 /
    42883 into plain sentences; `src/lib/admin-fetch.ts` turns a 401 into one sentence and
    keeps the form state (no more `window.location.reload()` on expiry).

## 4. Admin: "Schedule & scores" rebuilt around rounds

`TournamentRoundsPanel.tsx` and `TournamentMatchesPanel.tsx` deleted; `SchedulePanel.tsx`,
`EnterResultSheet.tsx` and a shared `AdminDialog.tsx` (extracted from the roster's sign-now
dialog, with Escape and scroll lock) added.

- One card per round in season order, "Counts toward the table" / "Does not count toward the
  table" under the label, the next matchday marked, matches inside as rows.
- **Enter result**: two big score fields with steppers; under each team its roster plus
  anyone who has scored for it this season; tap a name per goal; an **Own goal** button
  under the benefiting team; "Someone else" for guests; a live "Scorers: N of N goals" line
  that turns amber when they disagree and never blocks; one Save → one request → one
  transaction. Edit result reopens it pre-filled; Clear result inside it.
- No Status dropdown anywhere. No score field on the match form. Match numbers assigned by
  the server and shown, not typed. No manual up/down reorder (order is round, then match #).
- Add round: suggested label, next Friday, times copied, one yes/no question about the table.
  Add match inside a round: teams or placeholder text, kickoff 7 / 8 / 9 PM or other,
  "Add another".
- Page: "View public page" link in the header on every tab; stats tiles only on Roster;
  Schedule tab hidden on open play (same gate as Teams). Announcements empty-state copy fixed
  (everything posted is public).

## 5. Public: the event page for a running tournament

- Order on a phone: header → **At a glance** (leader, last matchday's scores, next matchday)
  → **Table · Matches · Scorers** (three tabs that fit 320px, `role=tablist`, tab mirrored to
  `?tab=` with `history.replaceState`, `id="hub"`) → sign-up / share / location card → About →
  "What you're walking into" behind a disclosure → Updates (pinned + 2 recent, "Show all") →
  the flyer last. Pre-season and open play keep the old order.
- Table: rows on phones (rank, colour, team, big Pts; second line P · W-D-L · GF GA · GD),
  full table from `md`; cut line under 4th when a non-counting round exists; tiebreak footnote.
  World Cup rows render as published, no cut line ("Final table as published").
- Matches: every round (empty ones say so or show placeholder pairings), round notes and
  cancellations shown, scorers under each side, "Own goal" printed as such, postponed rows
  show their new date, next and last-played rounds open by default.
- Scorers: shared ranks, full names, team dot, "Own goals: N", "All matches, including
  playoffs."
- `loadError` from rounds/matches rendered as the amber banner instead of silence. Share
  button shares the current URL. "Golden Glove for most saves" copy replaced with what exists.
  `/me` registration rows deep-link to `?tab=matches#hub`.

## 6. The import (run 2026-09-08 through the Supabase MCP tool)

`scripts/import-community-cup-fall-2026.sql`: rounds by label, matches by match_number,
updated in place, zero deletes (only the five played matches' scorer rows are rebuilt on
re-run). Result: 10 rounds, 25 matches, 30 scorer rows, 17 linked to people, 2 own goals.
Verified against the sheet with corrected GD:

| Team | P | Pts | GF/GA | GD |
|---|---|---|---|---|
| Hiram Clarke FC | 2 | 6 | 18/5 | +13 |
| Post Oak FC | 2 | 6 | 18/6 | +12 |
| 3rd Ward FC | 2 | 3 | 13/10 | +3 |
| S. Beltway FC | 1 | 0 | 2/9 | −7 |
| Bellaire FC | 1 | 0 | 2/10 | −8 |
| Townwood FC | 2 | 0 | 6/19 | −13 |

Scorers: Kelvin Cardona 8, Jesse Pecero 6, Rene Cruz 5, William Franco 5. The sheet's own
GD column says 9 and 8 for the top two; 18−5 and 18−6 are 13 and 12.

Decisions baked in: goals credited to the team whose match line they were on (the sheet's
scoring list disagrees for Brandon Bricker, Jose Chavarria and Tony — listed for the owner in
`docs/COMMUNITY-CUP-ACCEPTANCE.md`); match 5's goal lines were swapped on the sheet; roster
spellings win (Pecero, Erik, Dilver, Salvador, Kelvin); unknown surnames imported as first
names; "Beltway FC" is the team the owner created as "S. Beltway FC"; 3rd Ward FC got a colour.

## 7. Verification

`npm ci`, `npx tsc --noEmit`, `npm run lint`, the seven test scripts and `npm run build` all
pass. The hub was rendered from fixture data on a temporary route (deleted before commit)
and screenshotted with headless Chromium at 320, 375 and 430 px: no horizontal overflow on
any tab (`scrollWidth === clientWidth` at 320), points visible on every row, three tabs on
one line. See `docs/screenshots/community-cup-hub-320-matches.png` and
`docs/screenshots/community-cup-hub-375-table.png`. The admin cannot be driven from here (production rejects a locally signed cookie), so
`docs/COMMUNITY-CUP-ACCEPTANCE.md` gives the owner the Friday Sep 11 pass.

## 8. What still needs a human

1. Merge and deploy this branch before Friday Sep 11.
2. After the deploy, apply `20260908120100_matches_integrity_constraints.sql`.
3. Run `docs/COMMUNITY-CUP-ACCEPTANCE.md` on a phone on Friday; confirm the three team
   attributions and the four first-name-only scorers.
4. Decide whether "S. Beltway FC" should be renamed "Beltway FC" (Teams tab, one edit).
