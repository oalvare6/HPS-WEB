-- Baseline: tournaments.is_featured + public.tournament_updates.
--
-- Stage 1.6 (2026-09-10, docs/STAGE-1-6-MIGRATION-RECONCILIATION.md). Backfills
-- the migration history for the loose script
-- `supabase/tournaments-featured-and-updates.sql` (now archived under
-- docs/archive/loose-sql/), which was applied by hand and never as a
-- migration. `20260513121000_rls_policies.sql` enables RLS on
-- `tournament_updates`, so on an empty database that file failed as soon as
-- the tournaments dependency before it was fixed. Sorted directly after
-- 20260513000100_create_tournaments.sql, which it alters.
--
-- Featured tournaments + per-tournament updates feed. The cap of 3 featured
-- tournaments is enforced in the API layer (so we can return a clean 409 with a
-- friendly message), not via a check constraint here.
--
-- Idempotent: safe to re-run against production (no-op apart from recreating
-- the same trigger). Names match production: tournaments_is_featured_idx,
-- tournament_updates_pkey, tournament_updates_tournament_id_fkey,
-- tournament_updates_tournament_idx, set_updated_at_tournament_updates().
--
-- Rollback (do NOT run without explicit approval):
--   drop trigger if exists tournament_updates_set_updated_at on public.tournament_updates;
--   drop function if exists public.set_updated_at_tournament_updates();
--   drop table if exists public.tournament_updates;
--   drop index if exists public.tournaments_is_featured_idx;
--   alter table public.tournaments drop column if exists is_featured;

-- 1) Featured flag on tournaments
alter table public.tournaments
  add column if not exists is_featured boolean not null default false;

-- Partial index keeps "featured" lookups cheap even with many tournaments.
create index if not exists tournaments_is_featured_idx
  on public.tournaments (display_order asc, start_date asc)
  where is_featured = true;

-- 2) Per-tournament public updates / announcements
create table if not exists public.tournament_updates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pinned updates first, then newest first.
create index if not exists tournament_updates_tournament_idx
  on public.tournament_updates (tournament_id, pinned desc, created_at desc);

create or replace function public.set_updated_at_tournament_updates()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournament_updates_set_updated_at on public.tournament_updates;

create trigger tournament_updates_set_updated_at
before update on public.tournament_updates
for each row
execute function public.set_updated_at_tournament_updates();
