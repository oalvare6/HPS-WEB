# League schedule, scores, standings & top scorers

**Date:** 2026-06-19
**Goal:** Turn each tournament into a real, data-driven "league" experience —
fixtures, weekly scores, an automatic standings table, and a Golden Boot
(top scorers) leaderboard — all editable by the operator from the admin UI,
no code required.

This replaces the prior reality where a tournament schedule lived only as a
hardcoded flyer image. The flyer stays as the hero art; the schedule and
results are now real rows the client manages.

---

## 1. Product intent

- Public event page (`/events/[slug]`) reads like a premium sports-league page:
  - **Standings** table (P, W, D, L, GF, GA, GD, Pts) computed from results.
  - **Fixtures & Results** grouped by round/matchweek, with final scores.
  - **Top scorers** (Golden Boot) leaderboard.
- Everything is driven by data the operator edits in admin — they never touch code.
- Works for any tournament; the World Cup 7v7 is the first one seeded.

## 2. Data model

Reuses the existing per-tournament `teams` table for league teams (Brazil, USA,
Mexico, …). Two new tables:

### `matches`
A single fixture inside a tournament, optionally tied to a round/matchweek.

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `tournament_id` | uuid fk → tournaments | cascade delete |
| `round_id` | uuid fk → tournament_rounds | nullable, `set null` on delete |
| `home_team_id` / `away_team_id` | uuid fk → teams | nullable (placeholder fixtures) |
| `home_team_label` / `away_team_label` | text | used when no team id (e.g. "1st Place", "Winner SF1") |
| `home_score` / `away_score` | int ≥ 0 | null until played |
| `status` | text | `scheduled` \| `completed` \| `postponed` \| `cancelled` |
| `kickoff_time` | text | free text, e.g. "7:00 PM" |
| `match_date` | date | optional override; falls back to the round's date |
| `notes` | text | optional |
| `sort_order` | int | ordering within a round |

### `match_scorers`
One goal-tally row per scorer per match. Free-text name keeps admin entry fast
(operator only has first names) and powers the Golden Boot.

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `match_id` | uuid fk → matches | cascade delete |
| `team_id` | uuid fk → teams | nullable, which side scored |
| `scorer_name` | text | required |
| `goals` | int > 0 | default 1 |

Both tables are **public-read** via RLS (same pattern as `tournament_rounds`);
all writes go through admin API routes using the service role.

## 3. Derived data (no extra tables)

Computed in `src/lib/matches.ts` from completed matches:

- **Standings:** for each completed match with two real teams → played, W/D/L,
  GF, GA, GD, points (3/1/0). Sorted by Pts, then GD, then GF, then name.
- **Top scorers:** aggregate `match_scorers` by (team, lower(name)), summed
  goals, sorted desc.

## 4. Admin surface (no-code editing)

On the tournament **Edit** page (`/admin/tournaments/[id]/edit`):

- Existing **Schedule (rounds)** panel = matchweeks (Round 1, Semi-Final, …).
- Existing **Teams** tab (on the detail page) = league teams.
- New **`TournamentMatchesPanel`**: add/edit matches under each round — pick home
  & away team (or a custom placeholder label), enter the score, set status, and
  log scorers inline (name + goals + side). Delete/reorder supported.

New API routes (admin-only, service role, mirror the rounds routes):

- `GET/POST /api/admin/tournaments/[id]/matches`
- `PATCH/DELETE /api/admin/tournaments/[id]/matches/[matchId]`
- `POST /api/admin/tournaments/[id]/matches/[matchId]/scorers`
- `PATCH/DELETE /api/admin/tournaments/[id]/matches/[matchId]/scorers/[scorerId]`

All mutations `revalidatePath('/events/[slug]')` so the public page updates.

## 5. Public surface

`/events/[slug]` gains three premium, server-rendered sections (only shown when
data exists): **Standings**, **Fixtures & Results** (by round, with scores and
scorer chips), and **Top scorers**. Built as reusable components in
`src/components/shared/league/`.

## 6. Seeding the World Cup

`scripts/seed-world-cup-schedule.mjs` is idempotent and:

1. Upserts the six teams (Brazil, USA, Mexico, Kazakhstan, Morocco, India).
2. Upserts the rounds (Round 1–7, Semi-Final, Final) from the flyer.
3. Upserts the 24 matches from the flyer.
4. Records Round 1 results: Brazil–USA postponed, Mexico 5–5 Kazakhstan,
   Morocco 6–11 India, plus the scorers the operator reported.

Run: `node --env-file=.env.local scripts/seed-world-cup-schedule.mjs`

## 7. Migration / rollback

`supabase/migrations/20260619190000_create_matches.sql` creates both tables,
indexes, `updated_at` triggers, and public-read RLS. Rollback SQL is included as
a trailing comment (`drop table match_scorers; drop table matches;`).
