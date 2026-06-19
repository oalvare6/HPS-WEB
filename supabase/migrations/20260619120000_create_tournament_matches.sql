-- Per-tournament match results + goal scorers. Lets the public event page
-- show round-by-round scorelines, a standings table, and a top-scorers
-- (Golden Boot) leaderboard instead of just a schedule of dates.
--
-- Idempotent: safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete set null,
  stage text not null default 'group'
    check (stage in ('group', 'semifinal', 'final')),
  match_date date,
  kickoff_time text,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  home_score integer,
  away_score integer,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'final', 'postponed', 'cancelled')),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_matches_teams_distinct check (home_team_id <> away_team_id),
  constraint tournament_matches_score_pairing check (
    (status = 'final' and home_score is not null and away_score is not null)
    or (status <> 'final')
  )
);

create index if not exists tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, sort_order asc, match_date asc);
create index if not exists tournament_matches_round_idx
  on public.tournament_matches (round_id) where round_id is not null;
create index if not exists tournament_matches_home_team_idx
  on public.tournament_matches (home_team_id);
create index if not exists tournament_matches_away_team_idx
  on public.tournament_matches (away_team_id);

create or replace function public.set_updated_at_tournament_matches()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournament_matches_set_updated_at on public.tournament_matches;

create trigger tournament_matches_set_updated_at
before update on public.tournament_matches
for each row
execute function public.set_updated_at_tournament_matches();

-- Individual goal-scorer lines per match, e.g. "Jason — 3" for Mexico.
-- player_name is free text (round-robin stat sheets are first-name-only and
-- not always tied to a registered contact); team_id disambiguates same-name
-- players across the two sides of a match.
create table if not exists public.match_goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_name text not null,
  goals integer not null default 1 check (goals > 0),
  created_at timestamptz not null default now()
);

create index if not exists match_goals_match_idx on public.match_goals (match_id);
create index if not exists match_goals_team_idx on public.match_goals (team_id);
