-- Tournament hub schema: matches (team-vs-team fixtures with scores) and
-- match_scorers (free-text goal scorers). Apply via the Supabase SQL Editor or
-- supabase db push / supabase migration up (when linked).
--
-- These tables already exist on the operator database (created ad hoc during an
-- earlier attempt) so every statement is idempotent: CREATE ... IF NOT EXISTS
-- makes the migration self-sufficient for fresh environments, while the ALTERs
-- backfill the two columns the hub adds (matches.match_number,
-- match_scorers.sort_order). Standings and the top-scorer leaderboard are
-- computed in application code from completed matches.

create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete set null,
  match_number integer,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  home_team_label text,
  away_team_label text,
  match_date date,
  kickoff_time text,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'postponed', 'cancelled')),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_scorers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  scorer_name text not null,
  goals integer not null default 1 check (goals > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columns the hub relies on, added to pre-existing tables when missing.
alter table public.matches add column if not exists match_number integer;
alter table public.match_scorers
  add column if not exists sort_order integer not null default 0;

create index if not exists matches_tournament_idx
  on public.matches (tournament_id, sort_order asc, match_date asc);
create index if not exists matches_round_idx on public.matches (round_id);
create index if not exists match_scorers_match_idx
  on public.match_scorers (match_id, sort_order asc);
create index if not exists match_scorers_team_idx on public.match_scorers (team_id);

create or replace function public.set_updated_at_matches()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at_matches();

drop trigger if exists match_scorers_set_updated_at on public.match_scorers;
create trigger match_scorers_set_updated_at
before update on public.match_scorers
for each row execute function public.set_updated_at_matches();

-- Public read (mirrors tournament_rounds). Writes go through the admin API
-- with the service role, which bypasses RLS.
alter table public.matches enable row level security;
drop policy if exists "Public read matches" on public.matches;
create policy "Public read matches" on public.matches for select using (true);

alter table public.match_scorers enable row level security;
drop policy if exists "Public read match_scorers" on public.match_scorers;
create policy "Public read match_scorers" on public.match_scorers for select using (true);

-- Rollback:
--   drop trigger if exists match_scorers_set_updated_at on public.match_scorers;
--   drop trigger if exists matches_set_updated_at on public.matches;
--   drop function if exists public.set_updated_at_matches();
--   drop table if exists public.match_scorers;
--   drop table if exists public.matches;
