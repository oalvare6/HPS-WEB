-- Drop the legacy league_round_overrides table. It was replaced by
-- public.tournament_rounds and is no longer read or written by the app.
--
-- This is intentionally a separate migration so it can be reviewed and
-- delayed if you want to keep the data around as a safety net.
--
-- The table is deliberately NOT recreated by any migration: it was only ever
-- created by a loose script, now archived at
-- docs/archive/loose-sql/league-round-overrides.sql. So on every fresh
-- database — every Supabase Preview branch, every clean build — this file runs
-- against a schema that has never heard of it. Both statements below name
-- their own object, so both are no-ops there.
--
-- There is NO `drop trigger if exists ... on public.league_round_overrides`
-- here, and none may be added back. `if exists` guards the TRIGGER; it never
-- guards the relation named after `on`. PostgreSQL 17 — what Supabase runs —
-- answers 42P01 and stops the whole chain when that relation is absent;
-- PostgreSQL 16 only warns and skips it, which is exactly how the line
-- survived here unnoticed until a Preview branch ran the chain (PR #9).
-- The line bought nothing in either case: dropping a table drops its triggers
-- with it.

drop table if exists public.league_round_overrides;

-- Only reachable on a database where the table was dropped by hand and left
-- its trigger function behind. `drop function if exists` names its own object,
-- so it is safe where neither ever existed, and the table above is already
-- gone by the time this runs, so nothing depends on it.
drop function if exists public.set_updated_at_round_overrides();
