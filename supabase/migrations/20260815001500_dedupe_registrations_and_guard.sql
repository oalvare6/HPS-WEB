-- One live spot per person per event — retire the duplicates, then make it
-- impossible to create more.
--
-- ## What was wrong
--
-- `registrations` has only ever had a *non-unique* index on
-- `(email, tournament_id)`, so nothing stopped the same person being written
-- onto the same roster twice. Nine people were:
--
--   8 × World Cup 7v7   (2 rows each, one with 3)
--   1 × Community Cup   (elmervillatoro@yahoo.com, two rows 7 minutes apart)
--
-- Every one has the same shape — an early row `pending` with no team and no
-- payment, then a later row `paid` with a team and a Stripe receipt. That is the
-- fingerprint of the two-front-doors bug this project already fixed: sign up on
-- one screen, come back and pay through another, get a second row. The strays
-- are the *first* attempt in almost every case, which is why "keep the newest"
-- would be wrong on its own and why the rule below leads with money.
--
-- The live harm was on the Community Cup: the Roster showed a phantom unpaid
-- Omar Villatoro next to the real paid one, so the owner had somebody to chase
-- who had already paid.
--
-- ## The rule
--
-- Keep exactly one row per (contact, event), ranked:
--   1. settled (`paid`/`waived`) first
--   2. then whichever has a succeeded Stripe payment
--   3. then whichever has a team
--   4. then the earliest — the original signup, not the re-submit
--
-- A row with money attached can therefore never rank below one without it. On
-- today's data all 10 retired rows are `pending`, teamless, and have zero
-- payment rows; the only case decided by the last tiebreak is
-- mplorenz@gmail.com, whose two rows are identical and 23 seconds apart.
--
-- ## Retired, not deleted
--
-- These get `cancelled_at`, the same column a player's own cancel uses, plus a
-- note saying why. Nothing is destroyed: there are no database backups (see
-- SESSION-LOG-2026-08-14-WAIVERS §7), and a `delete` here would be unrecoverable
-- for the sake of tidiness. Reverse any row with
-- `update public.registrations set cancelled_at = null where id = '…'`.
--
-- ⚠ Consequence handled in code: `/me` must collapse to one row per event and
-- prefer the live one, or eight people who actually played the World Cup would
-- see that registration badged "cancelled" in their own history.

-- Idempotent: once deduped no group has more than one live row, so the
-- `rn > 1` set is empty and re-running this is a no-op.
with ranked as (
  select r.id,
         row_number() over (
           partition by r.contact_id, r.tournament_id
           order by (r.payment_status in ('paid','waived')) desc,
                    (exists (select 1 from public.payments p
                              where p.registration_id = r.id
                                and p.status = 'succeeded')) desc,
                    (r.team_id is not null
                       or nullif(btrim(coalesce(r.team_name, '')), '') is not null) desc,
                    r.created_at asc
         ) as rn
  from public.registrations r
  where r.cancelled_at is null
    and r.contact_id is not null
    and r.tournament_id is not null
)
update public.registrations r
set cancelled_at = now(),
    notes = case
      when nullif(btrim(coalesce(r.notes, '')), '') is null
        then 'Retired as a duplicate signup (kept the settled row for this event).'
      else r.notes || E'\n' ||
           'Retired as a duplicate signup (kept the settled row for this event).'
    end
from ranked
where ranked.id = r.id and ranked.rn > 1;

-- Now it cannot happen again. Partial, so a cancelled row never blocks somebody
-- signing back up — which is the whole point of cancelling being reversible.
--
-- `contact_id is not null` because 37 legacy rows have no contact at all and
-- would otherwise collide with each other on a NULL that means "unknown", not
-- "the same person".
create unique index if not exists registrations_one_live_spot_idx
  on public.registrations (tournament_id, contact_id)
  where cancelled_at is null and contact_id is not null;

comment on index public.registrations_one_live_spot_idx is
  'One live registration per person per event. Violations surface as Postgres 23505 and are translated to "you are already signed up" by enrollContactInTournament — do not let a caller report 23505 as a generic failure, it tells the player to retry something that can never succeed.';
