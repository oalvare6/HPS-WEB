-- D15: open play is not a tournament, and the schema has never been able to say so.
--
-- The live database already holds one — "Open Play: Friday August 14th" — stored
-- as a `tournaments` row with `format = 'Mixed 7v7'`. It therefore renders the
-- whole tournament apparatus on its public page: "About this tournament", the
-- 25-minute-halves playbook, MVP awards at the final whistle, and a standings
-- hub. None of that is true of a pop-up night, and the operator has no way to
-- tell the two apart in admin either.
--
-- One column, two values. `guest_fee_cents`, `door_fee_cents` and the
-- "free if on an active tournament roster" rule from REBUILD-PLAN D7 are
-- deliberately NOT here: an open-play night has one price, and that is what
-- `entry_fee_cents` already holds. Track B2 can add the rest when there is no
-- live deadline.

alter table public.tournaments
  add column if not exists kind text not null default 'tournament';

-- Added separately and idempotently so re-running this migration against a
-- database that already has the column cannot fail on a duplicate constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_kind_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_kind_check
      check (kind in ('tournament', 'open_play'));
  end if;
end $$;

comment on column public.tournaments.kind is
  'What sort of event this is. ''tournament'' = a season with teams, a schedule and standings. ''open_play'' = a single pop-up night: one date, one door price, no teams and no table. Defaults to ''tournament'' so every existing row keeps behaving exactly as it did.';

-- Reads are filtered in the app, not by RLS: unlike `is_draft`, `kind` hides
-- nothing and gates no money — it only decides which words and panels a page
-- renders. The public read policy is deliberately left alone.
