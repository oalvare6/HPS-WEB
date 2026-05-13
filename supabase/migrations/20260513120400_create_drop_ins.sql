-- Drop-ins: one-night guest appearances at a tournament round.
-- Common case: "someone filled in for someone else and paid $15-20."
--
-- contact_id   = the person who actually played
-- paid_by_contact_id = (optional) the person who paid for them
-- payment is linked via payments.drop_in_id (set when Stripe confirms).

create extension if not exists pgcrypto;

create table if not exists public.drop_ins (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  paid_by_contact_id uuid references public.contacts(id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'waived', 'refunded')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drop_ins_tournament_idx on public.drop_ins (tournament_id, created_at desc);
create index if not exists drop_ins_round_idx on public.drop_ins (round_id) where round_id is not null;
create index if not exists drop_ins_contact_idx on public.drop_ins (contact_id);
create index if not exists drop_ins_paid_by_idx on public.drop_ins (paid_by_contact_id) where paid_by_contact_id is not null;
create index if not exists drop_ins_payment_status_idx on public.drop_ins (payment_status);

create or replace function public.set_updated_at_drop_ins()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drop_ins_set_updated_at on public.drop_ins;

create trigger drop_ins_set_updated_at
before update on public.drop_ins
for each row
execute function public.set_updated_at_drop_ins();
