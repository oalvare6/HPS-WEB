-- Phase 3 (Step 3b): link a registration to a team within its tournament.
--
-- This is the canonical membership signal for the new tournament-scoped Teams
-- tab. The legacy public.team_members table (from 20260513120300_create_teams.sql)
-- is intentionally left in place but unused by the new admin UI; revisit if a
-- future flow ever needs a roster entry that is not a registration.
--
-- Reversible. Rollback:
--   drop index if exists public.registrations_team_idx;
--   alter table public.registrations drop column if exists team_id;

alter table public.registrations
  add column if not exists team_id uuid
    references public.teams(id) on delete set null;

create index if not exists registrations_team_idx
  on public.registrations (team_id)
  where team_id is not null;
