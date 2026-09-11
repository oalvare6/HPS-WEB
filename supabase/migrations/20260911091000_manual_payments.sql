-- Stage 2.3 item A: cash, Zelle and other offline money, recorded properly.
--
-- Today the only way to record money taken at the field is to edit a
-- registration's status to 'paid', which throws away everything that matters
-- afterwards: how much, by what method, on what date, who accepted it. When a
-- payment is disputed three weeks later there is nothing to look at.
--
-- WHERE THIS SITS RELATIVE TO STRIPE (owner's decision, 2026-09-11)
--
-- `payments` is the Stripe ledger and stays exactly as it is. CLAUDE.md's rule —
-- "do not add a second writer of `payments` or of
-- `registrations.payment_status = 'paid'` FOR CARD MONEY" — exists because
-- settlement must converge on replay and re-derive amounts from rows. None of
-- that reasoning applies to a person writing down that they took fifty dollars
-- in cash, and Stripe has no record of such a payment to converge with.
--
-- So offline money gets its own table and its own writer, and **Stripe remains
-- authoritative for card settlement**. Nothing here ever writes `payments`,
-- and nothing here overwrites a status that card settlement owns: see the
-- deliberate refusal in `record_manual_payment` below.
--
-- WHY THE TABLE IS APPEND-ONLY
--
-- An audit trail that can be edited is not an audit trail. Money fields here are
-- never updated: a correction VOIDS the receipt (recording who voided it and
-- why) and enters a new one. The history is therefore the table itself — every
-- receipt ever entered, who entered it, when the money actually changed hands,
-- and whether it was later withdrawn. No second audit table is needed, and one
-- would only give two places to disagree.
--
-- Rollback (do NOT run without explicit approval; this holds the only record of
-- every non-card payment ever taken):
--   drop function if exists public.void_manual_payment(jsonb);
--   drop function if exists public.record_manual_payment(jsonb);
--   drop function if exists public.manual_payments_total_cents(uuid);
--   drop table if exists public.manual_payments;

create extension if not exists pgcrypto;

create table if not exists public.manual_payments (
  id              uuid        primary key default gen_random_uuid(),
  registration_id uuid        not null references public.registrations(id) on delete cascade,
  -- Denormalised links, nulled rather than blocking if the row they name goes:
  -- recording the money outranks recording the link (Stage 1.4).
  contact_id      uuid        references public.contacts(id) on delete set null,
  tournament_id   uuid        references public.tournaments(id) on delete set null,

  amount_cents    integer     not null check (amount_cents > 0),
  currency        text        not null default 'usd',
  method          text        not null check (method in ('cash', 'zelle', 'other')),
  -- The day the money changed hands, which is not the day it was typed in.
  received_at     date        not null,
  note            text,
  -- Who accepted it. The admin is a single shared login today, so this is the
  -- operator's own description ("Omar at the field"), not an account id.
  recorded_by     text        not null check (btrim(recorded_by) <> ''),
  created_at      timestamptz not null default now(),

  voided_at       timestamptz,
  voided_by       text,
  void_reason     text,

  constraint manual_payments_void_is_complete check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and btrim(coalesce(voided_by, '')) <> '')
  )
);

comment on table public.manual_payments is
  'Offline money: cash, Zelle, anything Stripe never saw. Append-only — money fields are never updated; a correction voids the receipt and enters a new one, so the table IS the audit history. Never written by Stripe settlement, and never a second writer of public.payments.';
comment on column public.manual_payments.received_at is
  'The day the money changed hands, not the day somebody typed it in.';
comment on column public.manual_payments.recorded_by is
  'Who accepted the money. The admin is one shared login, so this is a human description rather than an account id.';

create index if not exists manual_payments_registration_idx
  on public.manual_payments (registration_id, received_at desc);
create index if not exists manual_payments_tournament_idx
  on public.manual_payments (tournament_id) where tournament_id is not null;
create index if not exists manual_payments_live_idx
  on public.manual_payments (registration_id) where voided_at is null;

alter table public.manual_payments enable row level security;
revoke all on public.manual_payments from anon, authenticated;

-- Sum of everything still standing against one registration.
create or replace function public.manual_payments_total_cents(p_registration_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::integer
    from public.manual_payments
   where registration_id = p_registration_id
     and voided_at is null;
$$;

/*
  Recompute a registration's payment status from its live receipts.

  Three rules, in this order, and the order is the whole design:

  1. **Stripe wins.** If a succeeded `payments` row exists, the status is card
     settlement's to own and nothing here touches it. The money is still
     recorded and the collision is flagged.
  2. **An operator decision wins.** 'waived' and 'refunded' are statements the
     owner made deliberately; silently flipping either to 'paid' because cash
     turned up would erase that decision.
  3. **Otherwise, once any receipt exists, the receipts decide** — including
     downwards. Below the fee is 'partial', not 'paid', because the money is
     genuinely still outstanding.

  Rule 3's "once any receipt exists" is load-bearing, and it was wrong in the
  first draft. That version returned early on any 'paid' status, to protect
  Stripe. But when a receipt itself brought the total up to the fee, the status
  became 'paid' — and voiding that receipt then hit the same guard and left the
  registration reading 'paid' with $20 recorded against a $50 fee. A void that
  does not walk the status back down is worse than no void at all.

  The check is for a receipt row *ever*, not a live one, precisely so that
  voiding the last receipt still recomputes (to 'pending'). And a registration
  with no receipts at all is left alone, so an operator who set 'paid' by hand on
  the status dropdown does not have it undone by this function.
*/
create or replace function public.apply_manual_payment_status(p_registration_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status       text;
  v_event        uuid;
  v_fee          integer;
  v_total        integer;
  v_new          text;
  v_card         boolean;
  v_has_receipts boolean;
begin
  select payment_status, tournament_id into v_status, v_event
    from public.registrations
   where id = p_registration_id
     for update;
  if not found then
    raise exception 'That registration does not exist.' using errcode = 'P0002';
  end if;

  -- 1. Stripe owns card settlement.
  select exists (
    select 1 from public.payments
     where registration_id = p_registration_id and status = 'succeeded'
  ) into v_card;
  if v_card then
    return v_status;
  end if;

  -- 2. The owner's own decisions stand.
  if v_status in ('waived', 'refunded') then
    return v_status;
  end if;

  -- 3. Receipts drive the status, but only where there are receipts to drive it.
  select exists (
    select 1 from public.manual_payments where registration_id = p_registration_id
  ) into v_has_receipts;
  if not v_has_receipts then
    return v_status;
  end if;

  v_total := public.manual_payments_total_cents(p_registration_id);
  select entry_fee_cents into v_fee from public.tournaments where id = v_event;

  if v_total <= 0 then
    v_new := 'pending';
  elsif v_fee is null or v_total >= v_fee then
    v_new := 'paid';
  else
    v_new := 'partial';
  end if;

  if v_new is distinct from v_status then
    update public.registrations set payment_status = v_new where id = p_registration_id;
  end if;
  return v_new;
end;
$$;

/*
  The one writer. Takes jsonb so the route passes a single validated object,
  matching `finalize_checkout_payment`'s shape.

  Keys: registration_id, amount_cents, method, received_at, recorded_by,
        note (optional), currency (optional).
*/
create or replace function public.record_manual_payment(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration uuid := nullif(p->>'registration_id', '')::uuid;
  v_amount       integer := (p->>'amount_cents')::integer;
  v_method       text := nullif(p->>'method', '');
  v_received     date := (p->>'received_at')::date;
  v_by           text := nullif(btrim(p->>'recorded_by'), '');
  v_note         text := nullif(btrim(p->>'note'), '');
  v_currency     text := lower(coalesce(nullif(p->>'currency', ''), 'usd'));
  v_status       text;
  v_event        uuid;
  v_contact      uuid;
  v_cancelled    timestamptz;
  v_card         boolean;
  v_id           uuid;
  v_new_status   text;
  v_flagged      boolean := false;
begin
  if v_registration is null then
    raise exception 'registration_id is required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'A receipt needs an amount greater than zero.' using errcode = '22023';
  end if;
  if v_method is null or v_method not in ('cash', 'zelle', 'other') then
    raise exception 'Method must be cash, zelle or other.' using errcode = '22023';
  end if;
  if v_received is null then
    raise exception 'received_at is required' using errcode = '22023';
  end if;
  if v_received > current_date then
    raise exception 'A payment cannot be received in the future.' using errcode = '22023';
  end if;
  if v_by is null then
    raise exception 'recorded_by is required' using errcode = '22023';
  end if;

  select payment_status, tournament_id, contact_id, cancelled_at
    into v_status, v_event, v_contact, v_cancelled
    from public.registrations
   where id = v_registration
     for update;
  if not found then
    raise exception 'That registration does not exist.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.payments
     where registration_id = v_registration and status = 'succeeded'
  ) into v_card;

  insert into public.manual_payments
    (registration_id, contact_id, tournament_id, amount_cents, currency,
     method, received_at, note, recorded_by)
  values
    (v_registration, v_contact, v_event, v_amount, v_currency,
     v_method, v_received, v_note, v_by)
  returning id into v_id;

  -- Flag rather than refuse: the money was taken either way, and the owner
  -- needs to see the collision rather than have the write rejected.
  if v_card then
    update public.registrations
       set needs_admin_review = true,
           notes = public.append_note_line(notes,
             'Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment.')
     where id = v_registration;
    v_flagged := true;
  end if;
  if v_cancelled is not null then
    update public.registrations
       set needs_admin_review = true,
           notes = public.append_note_line(notes,
             'Offline payment recorded AFTER this spot was cancelled — refund decision needed.')
     where id = v_registration;
    v_flagged := true;
  end if;

  v_new_status := public.apply_manual_payment_status(v_registration);

  return jsonb_build_object(
    'id', v_id,
    'payment_status', v_new_status,
    'status_unchanged', (v_new_status = v_status),
    'total_cents', public.manual_payments_total_cents(v_registration),
    'needs_review', v_flagged
  );
end;
$$;

/* Void a receipt. Keys: id, voided_by, reason (optional). */
create or replace function public.void_manual_payment(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_by     text := nullif(btrim(p->>'voided_by'), '');
  v_reason text := nullif(btrim(p->>'reason'), '');
  v_registration uuid;
  v_already timestamptz;
  v_status text;
begin
  if v_id is null then
    raise exception 'id is required' using errcode = '22023';
  end if;
  if v_by is null then
    raise exception 'voided_by is required' using errcode = '22023';
  end if;

  select registration_id, voided_at into v_registration, v_already
    from public.manual_payments
   where id = v_id
     for update;
  if not found then
    raise exception 'That receipt does not exist.' using errcode = 'P0002';
  end if;
  if v_already is not null then
    -- Idempotent: voiding twice is not an error, it is the same outcome.
    return jsonb_build_object('id', v_id, 'already_voided', true);
  end if;

  update public.manual_payments
     set voided_at = now(), voided_by = v_by, void_reason = v_reason
   where id = v_id;

  v_status := public.apply_manual_payment_status(v_registration);

  return jsonb_build_object(
    'id', v_id,
    'already_voided', false,
    'payment_status', v_status,
    'total_cents', public.manual_payments_total_cents(v_registration)
  );
end;
$$;

revoke all on function public.manual_payments_total_cents(uuid) from public, anon, authenticated;
revoke all on function public.apply_manual_payment_status(uuid) from public, anon, authenticated;
revoke all on function public.record_manual_payment(jsonb) from public, anon, authenticated;
revoke all on function public.void_manual_payment(jsonb) from public, anon, authenticated;

grant execute on function public.manual_payments_total_cents(uuid) to service_role;
grant execute on function public.apply_manual_payment_status(uuid) to service_role;
grant execute on function public.record_manual_payment(jsonb) to service_role;
grant execute on function public.void_manual_payment(jsonb) to service_role;
