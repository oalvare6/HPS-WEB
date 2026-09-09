-- Community Cup, 2026-09-08. Two integrity rules the database now refuses to
-- break: one match number per event, and a completed match always has both
-- scores. FOLLOWUPS:78 records nine World Cup matches that sat with a score but
-- status 'scheduled' (invisible to players) and the mirror image is just as
-- silent; standings.ts drops either without a word.
--
-- DEPLOY ORDER: apply this AFTER the code that translates these errors is
-- deployed (src/lib/admin-db-errors.ts maps 23505 and 23514 to plain
-- sentences) and AFTER the Community Cup import has run. Before that, the
-- currently deployed admin can still PATCH status='completed' with no scores
-- and would show the owner a raw Postgres message.
--
-- Pre-checks (both must return no rows / zero):
--   select tournament_id, match_number, count(*) from public.matches
--    where match_number is not null group by 1, 2 having count(*) > 1;
--   select count(*) from public.matches
--    where status = 'completed' and (home_score is null or away_score is null);

create unique index if not exists matches_tournament_match_number_idx
  on public.matches (tournament_id, match_number)
  where match_number is not null;

do $$
declare
  v_bad integer;
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_completed_has_scores'
  ) then
    select count(*) into v_bad
      from public.matches
     where status = 'completed' and (home_score is null or away_score is null);
    if v_bad > 0 then
      raise exception
        '% completed match(es) have no score. Fix them (enter the result or set status back to scheduled) before adding this constraint.',
        v_bad;
    end if;
    alter table public.matches
      add constraint matches_completed_has_scores
      check (status <> 'completed' or (home_score is not null and away_score is not null));
  end if;
end $$;

-- Rollback:
--   alter table public.matches drop constraint if exists matches_completed_has_scores;
--   drop index if exists public.matches_tournament_match_number_idx;
