-- Baseline: create public.tournaments (the "events" table).
--
-- Stage 1.6 (2026-09-10, docs/STAGE-1-6-MIGRATION-RECONCILIATION.md). This is
-- THE first broken dependency in the migration history. `tournaments` was only
-- ever defined by the loose script `supabase/tournaments.sql` (now archived
-- under docs/archive/loose-sql/), applied by hand in the SQL editor, and never
-- by a migration. The very next file in the sequence,
-- `20260513120000_create_tournament_rounds.sql`, declares a foreign key to
-- `public.tournaments(id)`, so on an empty database it fails with
-- `relation "public.tournaments" does not exist` and every later migration is
-- skipped. Production never noticed because the table was already there.
--
-- The timestamp sorts this file just before that first dependent. It is also
-- close to the real apply time: the `tournament-images` bucket was created at
-- 2026-05-13 00:14 UTC in the same working session, and the May-13 migrations
-- that build on this table carry 12:00 stamps.
--
-- Deliberately NOT included: the "Spring Classic 2026" seed row that the loose
-- script inserted. A migration defines structure; a fresh database (a Preview
-- branch, a local test) does not need that event, and production already has
-- its own rows.
--
-- Idempotent (`if not exists`, `create or replace`, `drop trigger if exists`),
-- so re-running it against production is a no-op apart from recreating the
-- same trigger. Constraint and index names match production exactly:
-- tournaments_pkey, tournaments_slug_key, tournaments_status_check,
-- tournaments_display_order_start_date_idx, tournaments_status_idx.
--
-- Rollback (do NOT run without explicit approval; destructive, and every other
-- table in the roster cascades from this one):
--   drop trigger if exists tournaments_set_updated_at on public.tournaments;
--   drop table if exists public.tournaments;
--   -- public.set_updated_at() is shared with registrations; do not drop it here.

create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  status text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'completed', 'cancelled')),
  registration_open boolean not null default false,
  payments_open boolean not null default false,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  time_start text,
  time_end text,
  recurrence text,
  location text,
  format text,
  entry_fee numeric(10, 2),
  max_teams integer,
  image_url text,
  image_preset text,
  register_url text,
  pay_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_display_order_start_date_idx
  on public.tournaments (display_order asc, start_date asc);

create index if not exists tournaments_status_idx
  on public.tournaments (status);

-- Shared updated_at setter. 20260319215600_create_registrations.sql creates the
-- same function with the same body; `create or replace` keeps them identical.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_set_updated_at on public.tournaments;

create trigger tournaments_set_updated_at
before update on public.tournaments
for each row
execute function public.set_updated_at();
