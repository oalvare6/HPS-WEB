-- Community Cup, 2026-09-08. Three additive columns and two functions so the
-- league table can tell league rounds from knockout rounds, an own goal can be
-- recorded without inventing a player, a scorer picked from the roster keeps
-- its identity, and a Friday-night result saves in one transaction.
--
-- DEPLOY ORDER: apply this BEFORE the code that writes these columns deploys.
-- Every column has a default and every deployed read of these tables is
-- select("*"), so the currently deployed site keeps working after this lands.
-- This is NOT the two-FK trap from CLAUDE.md: match_scorers.contact_id is the
-- only relationship from match_scorers to contacts and nothing embeds it, so
-- there is no PostgREST ambiguity to name.
--
-- Idempotent: every statement can be re-run.

-- 1. Which rounds count toward the table. Semi-Final, Final and the Exhibition
--    are rounds the owner still schedules and scores, but their results must
--    not move the league table.
alter table public.tournament_rounds
  add column if not exists counts_toward_table boolean not null default true;

comment on column public.tournament_rounds.counts_toward_table is
  'False for knockout and friendly rounds (semi-finals, final, exhibition). '
  'computeStandings skips matches in rounds where this is false. Matches with '
  'no round always count.';

-- 2. Own goals. THE ONE RULE: match_scorers.team_id is always the team the goal
--    COUNTED FOR. An own goal is a row on the benefiting team with
--    own_goal = true and scorer_name = 'Own goal' and no contact_id. Per-side
--    tallies then reconcile with the score, and the top-scorer list skips it.
alter table public.match_scorers
  add column if not exists own_goal boolean not null default false;

comment on column public.match_scorers.own_goal is
  'True when the goal was scored by the OTHER side into their own net. '
  'team_id is the team the goal counted for (the benefiting team), never the '
  'team that conceded it. Excluded from the top-scorer list.';

-- 3. Who scored, when the owner picked a name from the roster. Points at the
--    person (contacts), not the registration, because Track B3 retires
--    registration ids. Free-text scorers (guests) leave it null.
alter table public.match_scorers
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists match_scorers_contact_idx
  on public.match_scorers (contact_id)
  where contact_id is not null;

comment on column public.match_scorers.contact_id is
  'The person who scored, when picked from the roster. Null for free-text '
  'names. The top-scorer list dedupes on this when present.';

-- 4. Keep a stable person id off the browser key. match_scorers is publicly
--    readable (policy "Public read match_scorers"); every application read of
--    it goes through the service role, so the anon and authenticated roles
--    lose the whole-table SELECT and get it back column by column, without
--    contact_id. Any future column must be added to this grant to be readable
--    by the browser key; today nothing reads this table with that key.
revoke select on public.match_scorers from anon, authenticated;
grant select (id, match_id, team_id, scorer_name, goals, sort_order, own_goal, created_at, updated_at)
  on public.match_scorers to anon, authenticated;

-- 5. One transaction for a result: score + status + scorers together, or
--    nothing. supabase-js has no transactions, and a result that saved its
--    score but lost its scorers (or the reverse) is exactly the half-state the
--    owner cannot see. Grants copy public.open_play_attendees: service role only.
create or replace function public.save_match_result(
  p_tournament_id uuid,
  p_match_id uuid,
  p_home integer,
  p_away integer,
  p_scorers jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_home_team uuid;
  v_away_team uuid;
  r record;
  i integer := 0;
begin
  select home_team_id, away_team_id
    into v_home_team, v_away_team
    from public.matches
   where id = p_match_id and tournament_id = p_tournament_id
     for update;
  if not found then
    raise exception 'That match is not in this event.' using errcode = 'P0002';
  end if;
  if p_home is null or p_away is null or p_home < 0 or p_away < 0 then
    raise exception 'Enter both scores before saving.' using errcode = 'P0001';
  end if;
  if v_home_team is null or v_away_team is null then
    raise exception 'Set both teams before entering a result.' using errcode = 'P0001';
  end if;

  for r in
    select * from jsonb_to_recordset(coalesce(p_scorers, '[]'::jsonb))
      as x(team_id uuid, scorer_name text, goals integer, own_goal boolean, contact_id uuid)
  loop
    if r.team_id is null or (r.team_id <> v_home_team and r.team_id <> v_away_team) then
      raise exception 'Each scorer must belong to one of the two teams in this match.'
        using errcode = 'P0001';
    end if;
    if coalesce(btrim(r.scorer_name), '') = '' then
      raise exception 'Every scorer needs a name.' using errcode = 'P0001';
    end if;
    if coalesce(r.goals, 0) < 1 then
      raise exception 'Goals must be at least 1.' using errcode = 'P0001';
    end if;
  end loop;

  delete from public.match_scorers where match_id = p_match_id;

  for r in
    select * from jsonb_to_recordset(coalesce(p_scorers, '[]'::jsonb))
      as x(team_id uuid, scorer_name text, goals integer, own_goal boolean, contact_id uuid)
  loop
    insert into public.match_scorers
      (match_id, team_id, scorer_name, goals, own_goal, contact_id, sort_order)
    values
      (p_match_id, r.team_id, btrim(r.scorer_name), r.goals,
       coalesce(r.own_goal, false), r.contact_id, i);
    i := i + 1;
  end loop;

  update public.matches
     set home_score = p_home,
         away_score = p_away,
         status = 'completed'
   where id = p_match_id;
end;
$$;

revoke all on function public.save_match_result(uuid, uuid, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_match_result(uuid, uuid, integer, integer, jsonb)
  to service_role;

-- The reverse: a result entered by mistake goes back to "not played".
create or replace function public.clear_match_result(
  p_tournament_id uuid,
  p_match_id uuid
)
returns void
language plpgsql
security invoker
as $$
begin
  if not exists (
    select 1 from public.matches
     where id = p_match_id and tournament_id = p_tournament_id
  ) then
    raise exception 'That match is not in this event.' using errcode = 'P0002';
  end if;
  delete from public.match_scorers where match_id = p_match_id;
  update public.matches
     set home_score = null,
         away_score = null,
         status = 'scheduled'
   where id = p_match_id;
end;
$$;

revoke all on function public.clear_match_result(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.clear_match_result(uuid, uuid)
  to service_role;

-- Rollback:
--   drop function if exists public.clear_match_result(uuid, uuid);
--   drop function if exists public.save_match_result(uuid, uuid, integer, integer, jsonb);
--   revoke select on public.match_scorers from anon, authenticated;
--   grant select on public.match_scorers to anon, authenticated;
--   drop index if exists public.match_scorers_contact_idx;
--   alter table public.match_scorers drop column if exists contact_id;
--   alter table public.match_scorers drop column if exists own_goal;
--   alter table public.tournament_rounds drop column if exists counts_toward_table;
