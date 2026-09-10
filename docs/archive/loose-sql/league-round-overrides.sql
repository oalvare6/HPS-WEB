-- Per-round overrides for the curated league schedule.
-- Source of truth for dates remains src/lib/spring-2026-league-schedule.ts;
-- rows here only adjust status/note/reschedule when something changes mid-season.
create table if not exists public.league_round_overrides (
  date_key text primary key,
  status text not null check (status in ('scheduled', 'cancelled', 'rescheduled', 'note')),
  note text,
  rescheduled_to text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_round_overrides()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists league_round_overrides_set_updated_at on public.league_round_overrides;

create trigger league_round_overrides_set_updated_at
before update on public.league_round_overrides
for each row
execute function public.set_updated_at_round_overrides();
