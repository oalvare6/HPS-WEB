-- payments table
-- Each row represents one payment by one player for one tournament.
-- Players can have many payments; registrations remain a one-time record.
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

  -- Lifecycle: pending → succeeded | failed | refunded
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),

  notes text
);

-- Index to quickly list all payments for a given player by email
create index if not exists payments_email_idx on public.payments (email);

-- Index for FK lookups
create index if not exists payments_registration_id_idx on public.payments (registration_id);
