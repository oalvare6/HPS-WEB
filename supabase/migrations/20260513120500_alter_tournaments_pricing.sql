-- Move tournament pricing into the DB as the source of truth.
-- Existing `entry_fee numeric(10,2)` is kept; we add `entry_fee_cents` (integer)
-- for Stripe-friendly server-authoritative pricing and populate it from the
-- existing column when present.
--
-- `drop_in_fee_cents` defaults to $20.00 (2000 cents) and can be tuned per
-- tournament from the admin UI.
--
-- `stripe_product_id` / `stripe_price_id` are reserved for a future migration
-- to Stripe Products/Prices; we currently use dynamic price_data in checkout.

alter table public.tournaments
  add column if not exists entry_fee_cents integer
    check (entry_fee_cents is null or entry_fee_cents >= 0);

alter table public.tournaments
  add column if not exists drop_in_fee_cents integer not null default 2000
    check (drop_in_fee_cents >= 0);

alter table public.tournaments
  add column if not exists stripe_product_id text;

alter table public.tournaments
  add column if not exists stripe_price_id text;

update public.tournaments
   set entry_fee_cents = round(entry_fee * 100)::integer
 where entry_fee is not null
   and entry_fee_cents is null;
