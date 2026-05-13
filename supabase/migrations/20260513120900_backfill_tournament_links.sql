-- Best-effort backfill of tournament_id on registrations and payments.
-- We are intentionally conservative: only set tournament_id when there is
-- a single unambiguous candidate. Everything else stays NULL and admin
-- can fix it from the dashboard.
--
-- Rules:
--   1) If there is exactly one tournament in the DB, use it for all rows.
--   2) Otherwise, for payments only, try to match payments.tournament_name
--      (case-insensitive) to tournaments.title.
--   3) Leave the rest NULL.

do $$
declare
  total_tournaments int;
  the_only_tournament_id uuid;
begin
  select count(*) into total_tournaments from public.tournaments;

  if total_tournaments = 1 then
    select id into the_only_tournament_id from public.tournaments limit 1;

    update public.registrations
       set tournament_id = the_only_tournament_id
     where tournament_id is null;

    update public.payments
       set tournament_id = the_only_tournament_id
     where tournament_id is null;
  end if;
end$$;

-- Title-based match for payments (works even when there are multiple tournaments).
update public.payments p
   set tournament_id = t.id
  from public.tournaments t
 where p.tournament_id is null
   and p.tournament_name is not null
   and lower(t.title) = lower(p.tournament_name);
