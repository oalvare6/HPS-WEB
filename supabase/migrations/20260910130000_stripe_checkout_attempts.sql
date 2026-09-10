-- Remember what price we authorised, so a later edit cannot un-authorise a
-- payment the customer already made.
--
-- ## The problem (Stage 1.4 §5, closed here)
--
-- Settlement re-derives the expected amount from `tournaments.entry_fee_cents`
-- at the moment the webhook arrives. That is the right instinct — a Stripe
-- signature proves the event came from Stripe, not that its metadata is honest
-- — but it validates against the price NOW, not the price the customer was
-- actually quoted. Two ways that goes wrong:
--
--   1. Checkout billed through the Stripe Price object when the event had a
--      `stripe_price_id`, while validation used `entry_fee_cents`. Nothing kept
--      the two in step, so a drifted Price meant every card payment for that
--      event was charged, recorded, and then NOT confirmed. (Fixed in the same
--      change by billing from `entry_fee_cents` too — see
--      src/lib/stripe-checkout.ts.)
--
--   2. Even with one price source, the owner can edit the fee between the
--      moment a Checkout Session is created and the moment it is paid:
--
--         session created at $80 → admin changes the event to $90
--         → customer completes the $80 session they were quoted
--         → settlement expects 9000, sees 8000, refuses to confirm
--
--      The customer paid exactly what we asked them for and is told they still
--      owe. Rejecting that is not financial correctness; it is a bug.
--
-- ## What this table is
--
-- One row per Checkout Session we create, written at creation time, recording
-- the amount THIS SERVER authorised for THIS session. Settlement prefers it
-- over re-deriving:
--
--   attempt row exists  → the authorised amount is the expected amount
--   no attempt row      → fall back to re-deriving from the event rows, exactly
--                         as before (every session created before this migration,
--                         including the known $80 Community Cup record)
--
-- It is deliberately NOT a second price source: nothing computes a price from
-- this table. It is a record of a decision the pricing function already made,
-- so that the decision can be honoured later. The pricing function
-- (`priceTournamentCheckout`) remains the only thing that decides an amount.
--
-- ## Why a table and not Stripe metadata
--
-- Metadata would be simpler and is signature-verified — but the F-02 trust
-- model is explicit that metadata IDENTIFIES and never AUTHORISES, precisely so
-- that a session created by some other code path cannot dictate what we accept.
-- An amount in metadata would invert that. A server-side row keeps
-- "re-derive from rows we wrote" true; it is just a different row.
--
-- ## Shape
--
-- Purely additive: a new table, no existing object altered. Old application
-- code never reads it. New application code treats a missing row as "fall back",
-- so it is safe in either deploy order and safe if the write ever fails.
--
-- Rollback: `drop table public.stripe_checkout_attempts;` — settlement returns
-- to re-deriving from the event rows. Keeping it is preferable; it is the record
-- of what each customer was actually quoted.

create table if not exists public.stripe_checkout_attempts (
  stripe_session_id text        primary key,            -- cs_…
  amount_cents      integer     not null,
  currency          text        not null default 'usd',
  registration_id   uuid,
  drop_in_id        uuid,
  tournament_id     uuid,
  pay_kind          text,
  roster_size       integer,
  created_at        timestamptz not null default now(),
  constraint stripe_checkout_attempts_amount_check
    check (amount_cents >= 0),
  -- ON DELETE SET NULL throughout: an attempt outlives the thing it points at.
  -- The amount is the load-bearing column and never depends on these links.
  constraint stripe_checkout_attempts_registration_id_fkey
    foreign key (registration_id) references public.registrations(id) on delete set null,
  constraint stripe_checkout_attempts_drop_in_id_fkey
    foreign key (drop_in_id) references public.drop_ins(id) on delete set null,
  constraint stripe_checkout_attempts_tournament_id_fkey
    foreign key (tournament_id) references public.tournaments(id) on delete set null
);

create index if not exists stripe_checkout_attempts_registration_idx
  on public.stripe_checkout_attempts (registration_id)
  where registration_id is not null;

create index if not exists stripe_checkout_attempts_created_idx
  on public.stripe_checkout_attempts (created_at desc);

comment on table public.stripe_checkout_attempts is
  'One row per Checkout Session this server created, recording the amount it authorised. Settlement validates a payment against this row when it exists, so editing an event fee cannot invalidate a session a customer was already quoted. Not a price source: nothing computes an amount from here. Never contains card data.';

alter table public.stripe_checkout_attempts enable row level security;
revoke all on public.stripe_checkout_attempts from anon, authenticated;
