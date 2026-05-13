-- Link payments to tournament, contact, and drop-in records. Also fix the
-- latent risk where a Stripe payment_intent could be inserted twice — make
-- it UNIQUE (partial: ignore NULLs so legacy rows without intent are fine).

alter table public.payments
  add column if not exists tournament_id uuid
    references public.tournaments(id) on delete set null;

alter table public.payments
  add column if not exists contact_id uuid
    references public.contacts(id) on delete set null;

alter table public.payments
  add column if not exists drop_in_id uuid
    references public.drop_ins(id) on delete set null;

create index if not exists payments_tournament_idx
  on public.payments (tournament_id) where tournament_id is not null;

create index if not exists payments_contact_idx
  on public.payments (contact_id) where contact_id is not null;

create index if not exists payments_drop_in_idx
  on public.payments (drop_in_id) where drop_in_id is not null;

create unique index if not exists payments_stripe_payment_intent_unique_idx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
