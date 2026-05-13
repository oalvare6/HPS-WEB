-- Teams are scoped to a single tournament. Members are contacts.
-- A captain is just a contact reference (optional).

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  captain_contact_id uuid references public.contacts(id) on delete set null,
  color text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teams_tournament_name_unique_idx
  on public.teams (tournament_id, lower(name));
create index if not exists teams_tournament_idx on public.teams (tournament_id);
create index if not exists teams_captain_idx on public.teams (captain_contact_id) where captain_contact_id is not null;

create or replace function public.set_updated_at_teams()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teams_set_updated_at on public.teams;

create trigger teams_set_updated_at
before update on public.teams
for each row
execute function public.set_updated_at_teams();

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'player'
    check (role in ('player', 'captain', 'sub')),
  notes text,
  joined_at timestamptz not null default now(),
  primary key (team_id, contact_id)
);

create index if not exists team_members_contact_idx on public.team_members (contact_id);
