-- Stage 2.3 item C: a registration may only be assigned to a team in its own event.
--
-- Stage 2.2 found the gap by trying it (docs/STAGE-2-2-REPORT.md §6): nothing in
-- the database forbids `registrations.team_id` naming a team whose
-- `tournaments.id` differs from the registration's. `PATCH
-- /api/admin/registrations/[id]` does check, so nothing is wrong today — but the
-- invariant rests on application code alone, and a second writer or a new route
-- would reintroduce it silently.
--
-- WHY A TRIGGER AND NOT A COMPOSITE FOREIGN KEY
--
-- The declarative form would be `unique (id, tournament_id)` on teams plus
-- `foreign key (team_id, tournament_id) references teams (id, tournament_id)`.
-- Two reasons not to:
--
--   1. It adds a SECOND relationship between `registrations` and `teams`, and
--      PostgREST will not choose between two. Every `.select()` embedding
--      `teams(...)` from `registrations` would answer PGRST201 at runtime while
--      still passing tsc and next build — the exact trap CLAUDE.md records from
--      the `free_entry_tournament_id` migration, which broke the deployed site
--      in both deploy orders. Nothing embeds teams from registrations today
--      (checked), so the damage would land on whoever adds the first one.
--
--   2. A composite FK is MATCH SIMPLE: when any column of the key is NULL the
--      constraint is satisfied without checking anything. `tournament_id` is
--      nullable on `registrations`, so a row with a team and no event would slip
--      straight through the guard meant to catch it.
--
-- A trigger has neither problem: no new relationship for PostgREST to trip over,
-- and the NULL case is handled explicitly below.
--
-- NOT GUARDED HERE: moving a team to another event afterwards
-- (`update teams set tournament_id = ...`) would orphan existing assignments.
-- No admin route does that today. If one is ever added, it needs the mirror of
-- this check, and that is the moment to write it — not before.
--
-- Existing rows are left alone. The trigger fires on write, so a pre-existing
-- violation stays put rather than blocking an unrelated update; the DO block
-- below reports any, so they are visible rather than silent.
--
-- Rollback (do NOT run without explicit approval):
--   drop trigger if exists registrations_team_same_event on public.registrations;
--   drop function if exists public.assert_registration_team_same_event();

create or replace function public.assert_registration_team_same_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_team_event uuid;
begin
  -- Clearing a team assignment is always allowed.
  if new.team_id is null then
    return new;
  end if;

  select tournament_id into v_team_event
    from public.teams
   where id = new.team_id;

  if not found then
    -- The foreign key says this cannot happen; saying so plainly beats a
    -- confusing NULL comparison if it ever does.
    raise exception 'That team does not exist.'
      using errcode = '23514';
  end if;

  if new.tournament_id is null then
    raise exception 'A registration with no event cannot be assigned to a team.'
      using errcode = '23514';
  end if;

  if v_team_event is distinct from new.tournament_id then
    raise exception 'That team belongs to a different event.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_team_same_event on public.registrations;

create trigger registrations_team_same_event
before insert or update of team_id, tournament_id on public.registrations
for each row
execute function public.assert_registration_team_same_event();

-- Report, without failing, any row that already violates the rule. On an empty
-- database this is silent; on a database with history it tells the operator what
-- to look at instead of letting the new guard imply the data was always clean.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from public.registrations r
    join public.teams t on t.id = r.team_id
   where r.team_id is not null
     and (r.tournament_id is null or t.tournament_id is distinct from r.tournament_id);

  if v_bad > 0 then
    raise notice
      '% existing registration(s) are assigned to a team from another event. The new trigger does not reject them; they need fixing by hand.',
      v_bad;
  end if;
end $$;
