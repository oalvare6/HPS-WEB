-- Creates tournament_rounds (per-tournament schedule). Apply via Supabase SQL Editor
-- or: supabase db push / supabase migration up (when project is linked).

create extension if not exists pgcrypto;

create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  round_date date,
  time_start text,
  time_end text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'rescheduled', 'note')),
  note text,
  rescheduled_to date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_rounds_tournament_idx
  on public.tournament_rounds (tournament_id, sort_order asc, round_date asc);

create or replace function public.set_updated_at_tournament_rounds()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournament_rounds_set_updated_at on public.tournament_rounds;

create trigger tournament_rounds_set_updated_at
before update on public.tournament_rounds
for each row
execute function public.set_updated_at_tournament_rounds();
