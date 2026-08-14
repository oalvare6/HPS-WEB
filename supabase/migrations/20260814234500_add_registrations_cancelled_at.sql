-- A player can now take themselves off a roster, and the schema has never had
-- anywhere to record that.
--
-- `registrations` carries three state columns — `registration_type`,
-- `payment_status`, `docuseal_status` — and none of them can say "this person
-- withdrew". `payment_status` in particular looks tempting and is a trap: its
-- CHECK allows 'refunded' and 'waived', both of which mean something specific
-- about money and are read as such by the Roster totals, the pay gate and
-- `resolveSignupState`. Writing either one to mean "gone" would tell every
-- screen in the app that this player is settled up.
--
-- So: one nullable timestamptz. NULL means the spot is live. Non-NULL means
-- they gave it up, and when. Nothing is deleted — the owner keeps the record of
-- who dropped, and the waiver linkage on the row survives with it.

alter table public.registrations
  add column if not exists cancelled_at timestamptz;

-- The lookup every live-spot read now performs: "does this person hold a spot
-- on this event right now". Partial, so it only indexes rows that can match.
create index if not exists registrations_active_idx
  on public.registrations (tournament_id, contact_id)
  where cancelled_at is null;

comment on column public.registrations.cancelled_at is
  'When the player gave up this spot, or NULL while they still hold it. Rows are never deleted on cancel. Do NOT infer withdrawal from payment_status — ''waived'' and ''refunded'' are statements about money and are read as settled by the roster totals and the signup state machine.';

-- ⚠ Deliberately NOT added here:
--
--   create unique index registrations_one_live_spot_idx
--     on public.registrations (tournament_id, contact_id)
--     where cancelled_at is null and contact_id is not null;
--
-- It is the right constraint and it would fail today. Production already holds
-- a duplicate: elmervillatoro@yahoo.com has two Community Cup rows seven
-- minutes apart (2026-08-05 18:39 pending, 18:46 paid). Creating the index
-- would abort this migration and block the deploy. It waits until that pair is
-- merged — logged in FOLLOWUPS.md.
