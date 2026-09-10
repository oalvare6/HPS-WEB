-- Baseline: create public.payments (the Stripe ledger).
--
-- Stage 1.6 (2026-09-10, docs/STAGE-1-6-MIGRATION-RECONCILIATION.md). This
-- migration backfills the migration history for a table that was only ever
-- defined by the loose script `supabase/payments.sql` (now archived under
-- docs/archive/loose-sql/) and applied by hand in the Supabase SQL editor.
-- Nothing in supabase/migrations/ created it, so an empty database reached
-- `20260513120700_alter_payments_links.sql` with no `payments` table to alter
-- and the whole chain stopped. That is why every Supabase Preview branch has
-- failed since 2026-05-13.
--
-- The timestamp is an estimate of the original apply time, chosen so the file
-- sorts where the table really appeared in history: after `registrations`
-- (2026-03-19, which the foreign key needs) and before the first production
-- payment row (2026-03-27 21:28 UTC). It only has to sort before
-- 20260513120700; the day is the closest honest guess.
--
-- The DDL is idempotent (`if not exists`) so re-running it against production,
-- where the table already exists, is a no-op. Constraint names are left to
-- PostgreSQL so they come out exactly as production has them:
-- payments_pkey, payments_registration_id_fkey, payments_stripe_session_id_key,
-- payments_status_check (verified against pg_constraint, 2026-09-10).
--
-- Rollback (do NOT run without explicit approval; this is destructive and the
-- table holds every card payment ever taken):
--   drop table if exists public.payments;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Links back to the player's registration (nullable in case email isn't matched)
  registration_id uuid references public.registrations(id) on delete set null,

  -- Denormalised email so we can always look up a player even without a FK match
  email text not null,

  -- Payment details
  amount numeric(10, 2) not null,
  currency text not null default 'usd',

  -- Which tournament / event this payment covers
  tournament_name text,

  -- Stripe identifiers
  stripe_session_id text unique,
  stripe_payment_intent_id text,

  -- Lifecycle: pending -> succeeded | failed | refunded
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),

  notes text
);

-- Index to quickly list all payments for a given player by email
create index if not exists payments_email_idx on public.payments (email);

-- Index for FK lookups
create index if not exists payments_registration_id_idx on public.payments (registration_id);
