-- Adds matches.advanced_team_id: marks which team advanced from a knockout
-- match that did not produce a winner on the scoreboard (e.g. the World Cup
-- semi-final that finished 6-6 with Morocco advancing). Nullable; only set on
-- knockout matches decided off the scoreline.

alter table public.matches
  add column if not exists advanced_team_id uuid references public.teams (id) on delete set null;

comment on column public.matches.advanced_team_id is
  'Team that advanced from this knockout match when the score alone does not decide it (draw settled by shootout/ruling).';

-- Rollback:
-- alter table public.matches drop column if exists advanced_team_id;
