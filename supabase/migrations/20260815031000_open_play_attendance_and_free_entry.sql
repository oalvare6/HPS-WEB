-- D7, second half: record *why* somebody played free, and publish a roster that
-- cannot leak more than a first name.
--
-- ## Why this sits on `registrations` and not `drop_ins`
--
-- REBUILD-PLAN B3 has `drop_ins` folded into a future `roster_entries` table,
-- and `drop_ins` is the semantically prettier home for "one person, one night,
-- one fee". It was still the wrong place to put this today, for a reason that
-- only shows up when you read the calling code rather than the schema:
--
--   * `drop_ins` has no `cancelled_at`, so a player could never get off the
--     list — and a hard delete is exactly what 20260814234500 forbade.
--   * It has no `payment_method`, so the cash/card declaration (D14) has
--     nowhere to land.
--   * It has no unique index, so the "one live spot per person per event"
--     contract that 20260815001500 was written to establish would not exist for
--     open play — the same duplicate-row bug, reintroduced by the back door.
--   * `/me` reads `registrations` only, while payment history is keyed on
--     `contact_id`. A player would have seen "No registrations" above a receipt
--     for a night they had paid for.
--
-- The argument *for* `drop_ins` was that it is keyed on `contact_id`, so a
-- returning player confirms with one tap and re-enters nothing. That is already
-- true of `registrations`: `/api/register/join` builds the row from the contact.
--
-- So: one new nullable column here, and open play keeps every guarantee the
-- signup path spent two sessions earning.

-- ⚠ THIS FK IS THE SECOND ONE FROM `registrations` TO `tournaments`.
--
-- That is not a detail. PostgREST refuses to guess between two relationships:
-- every `.select()` that embedded `tournaments(...)` from `registrations`
-- without naming a constraint started answering **PGRST201** the moment this
-- ran, and each is a page rather than an edge case — `/pay`, `/me`, the waiver
-- signing screen, the admin Registrants tab, `/api/registrations/[id]` (which
-- hydrates PayForm) and the captain paid-ack route.
--
-- All six were rewritten to `tournaments!registrations_tournament_id_fkey(...)`
-- in the same change. **If you add another embed of `tournaments` from
-- `registrations`, you must name the constraint too** — an unqualified one will
-- pass code review, pass `tsc`, pass `npm run build`, and 500 in production,
-- because the ambiguity lives in the database and not in the TypeScript.
--
-- This is the same shape as the `is_draft` lesson recorded in
-- 20260814230000: schema changes that look additive can break reads that never
-- mentioned the new column.

alter table public.registrations
  add column if not exists free_entry_tournament_id uuid
    references public.tournaments(id) on delete set null;

comment on column public.registrations.free_entry_tournament_id is
  'Open play only (D7). Which tournament bought this person free entry to this night, at the moment they confirmed. Set together with payment_status = ''waived''. Recorded rather than recomputed on purpose: the config on the open-play event can change afterwards, and when somebody disputes a comp at the field the answer has to be what was true when they signed up, not what the rule says today. NULL on every tournament registration and on anyone who paid the door price.';

-- ---------------------------------------------------------------------------
-- The public attendee list
-- ---------------------------------------------------------------------------
--
-- Truncation happens HERE, not in the component. If the API response carries
-- full surnames and React renders only the initial, the full names are still in
-- the page payload and in anyone's network tab — the list would look private
-- while being nothing of the sort.
--
-- The `kind = 'open_play'` join is a hard scope, not a caller convention:
-- tournament rosters must never be publishable through this function, and the
-- safest way to guarantee that is to make it impossible to ask.
--
-- Note this is the one place `kind` is allowed to gate anything, and it gates
-- *disclosure*, in the fail-closed direction. lib/event-kind.ts forbids `kind`
-- from gating money, sign-ups or visibility because those must fail open; an
-- unrecognised kind here yields an empty list, which is the safe answer.

create or replace function public.open_play_attendees(p_event_id uuid)
returns table (first_name text, last_initial text, joined_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select r.first_name,
         left(r.last_name, 1) as last_initial,
         r.created_at as joined_at
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.tournament_id = p_event_id
    and t.kind = 'open_play'
    and r.cancelled_at is null
  order by r.created_at;
$$;

comment on function public.open_play_attendees(uuid) is
  'Public "who is coming" list for one open-play night: first name + last initial only, surname truncated in SQL so a full surname never reaches a response body. Hard-scoped to kind = ''open_play'' so a tournament roster can never be published through it. Cancelled signups are excluded so the list stays honest.';

-- Deliberately not reachable from a browser. RLS on `registrations` is enabled
-- with zero policies (deny-all for anon and authenticated), and this function is
-- SECURITY INVOKER, so those roles would get an empty set anyway — revoking is
-- belt and braces against somebody later adding a read policy for an unrelated
-- reason and quietly turning this into a public tap on the roster.
revoke all on function public.open_play_attendees(uuid) from public;
revoke all on function public.open_play_attendees(uuid) from anon, authenticated;
grant execute on function public.open_play_attendees(uuid) to service_role;
