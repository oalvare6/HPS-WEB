-- Matches + match scorers. Powers the public fixtures/results, standings table,
-- and Golden Boot (top scorers) leaderboard. League "teams" reuse the existing
-- public.teams table (per-tournament). Apply via Supabase SQL Editor or
-- `supabase db push` when the project is linked.
--
-- Rollback:
--   drop table if exists public.match_scorers;
--   drop table if exists public.matches;

create extension if not exists pgcrypto;

-- ----- matches ---------------------------------------------------------------

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete set null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  -- Free-text stand-ins for fixtures without a concrete team yet (e.g. the
  -- final's "Winner SF1", or a placeholder seed line like "1st Place").
  home_team_label text,
  away_team_label text,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'postponed', 'cancelled')),
  kickoff_time text,
  match_date date,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matches_tournament_idx
  on public.matches (tournament_id, sort_order asc, match_date asc);
create index if not exists matches_round_idx
  on public.matches (round_id) where round_id is not null;
create index if not exists matches_home_team_idx
  on public.matches (home_team_id) where home_team_id is not null;
create index if not exists matches_away_team_idx
  on public.matches (away_team_id) where away_team_id is not null;

create or replace function public.set_updated_at_matches()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;

create trigger matches_set_updated_at
before update on public.matches
for each row
execute function public.set_updated_at_matches();

-- ----- match_scorers ---------------------------------------------------------

create table if not exists public.match_scorers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  scorer_name text not null,
  goals integer not null default 1 check (goals > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_scorers_match_idx
  on public.match_scorers (match_id);
create index if not exists match_scorers_team_idx
  on public.match_scorers (team_id) where team_id is not null;

create or replace function public.set_updated_at_match_scorers()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists match_scorers_set_updated_at on public.match_scorers;

create trigger match_scorers_set_updated_at
before update on public.match_scorers
for each row
execute function public.set_updated_at_match_scorers();

-- ----- RLS: public read, admin (service role) write -------------------------
-- Mirrors tournament_rounds: anyone can read; writes only via service role.

alter table public.matches enable row level security;
drop policy if exists "Public read matches" on public.matches;
create policy "Public read matches"
  on public.matches
  for select
  using (true);

alter table public.match_scorers enable row level security;
drop policy if exists "Public read match_scorers" on public.match_scorers;
create policy "Public read match_scorers"
  on public.match_scorers
  for select
  using (true);
