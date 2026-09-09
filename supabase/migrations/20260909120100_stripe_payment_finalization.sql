-- F-02 remediation: one transaction for "Stripe paid → record the payment →
-- confirm the registration", with delivery idempotency on the Stripe event id
-- and business uniqueness on the Checkout Session id.
--
-- ## Why
--
-- backend_audit_v1.md F-02: recordCheckoutSessionPayment() inserted the
-- `payments` row and then updated `registrations.payment_status` as a second
-- statement whose failure was only logged. Once the payments row existed every
-- retry short-circuited on "already recorded" and never flipped the
-- registration; the webhook answered 200 regardless. Production holds one such
-- row (docs/core_schema_diff.md §5).
--
-- ## What this adds (purely additive)
--
--   stripe_webhook_events            one row per Stripe event id we processed
--                                    (delivery idempotency + reconciliation trail)
--   finalize_checkout_payment(jsonb) the single transaction: upsert the payment
--                                    on stripe_session_id, then confirm the
--                                    registration / drop-in when the caller has
--                                    validated the business facts, or flag it
--                                    for review when it has not
--   record_stripe_webhook_event(...) bookkeeping for events that carry no
--                                    settlement (async failed, unpaid session)
--   append_note_line(text, text)     small helper: append a line to `notes`
--                                    exactly once
--
-- The function is deliberately CONVERGENT, not "insert-once": calling it again
-- for a session whose payment row already exists re-applies the registration
-- confirmation. That is what repairs the known production row and what makes
-- webhook replay, the success page, sync-payments and the offline reconciler
-- all reach the same end state.
--
-- Business validation (amount, currency, event association) happens in the
-- application BEFORE this call, against re-read server-side rows — a Stripe
-- signature proves the event came from Stripe, not that its metadata is right.
-- The application passes `confirm = true` only when everything matched.
--
-- ## Rollout / rollback
--
-- Additive. Old code never reads these objects; new code returns 5xx to Stripe
-- (so Stripe retries) if the function is missing. Rollback = application
-- rollback; keep the tables (they are the audit trail).
--
-- Targets the production structure in docs/core_schema_snapshot.sql:
--   payments(stripe_session_id UNIQUE, stripe_payment_intent_id partial UNIQUE,
--            email NOT NULL, amount numeric, currency, tournament_name, status,
--            notes, tournament_id, contact_id, registration_id, drop_in_id)
--   registrations(payment_status CHECK, cancelled_at, needs_admin_review,
--                 notes, team_name)
--   drop_ins(payment_status CHECK)

-- ---------------------------------------------------------------------------
-- 1. Delivery ledger
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  id            text        primary key,          -- evt_…
  type          text        not null,
  object_id     text,                             -- cs_… / pi_…
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  outcome       text,
  detail        text
);

create index if not exists stripe_webhook_events_object_idx
  on public.stripe_webhook_events (object_id)
  where object_id is not null;

comment on table public.stripe_webhook_events is
  'One row per Stripe event id handled by /api/stripe/webhook. processed_at IS NULL means the handler started but did not commit (retry expected). Never contains card data.';

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helper: append a note line exactly once
-- ---------------------------------------------------------------------------
create or replace function public.append_note_line(p_existing text, p_line text)
returns text
language sql
immutable
as $$
  select case
    when p_line is null or btrim(p_line) = '' then p_existing
    when p_existing is not null and position(p_line in p_existing) > 0 then p_existing
    when p_existing is null or btrim(p_existing) = '' then p_line
    else btrim(p_existing) || E'\n' || p_line
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping for non-settling events
-- ---------------------------------------------------------------------------
create or replace function public.record_stripe_webhook_event(
  p_event_id  text,
  p_type      text,
  p_object_id text,
  p_outcome   text,
  p_detail    text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_event_id is null then
    raise exception 'event id is required' using errcode = '22023';
  end if;
  insert into public.stripe_webhook_events as ev (id, type, object_id, processed_at, outcome, detail)
  values (p_event_id, coalesce(p_type, 'unknown'), p_object_id, now(), p_outcome, p_detail)
  on conflict (id) do update
    set processed_at = coalesce(ev.processed_at, excluded.processed_at),
        outcome      = coalesce(ev.outcome, excluded.outcome),
        detail       = coalesce(ev.detail, excluded.detail);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_stripe_webhook_event(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_webhook_event(text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. The settlement transaction
-- ---------------------------------------------------------------------------
-- Input keys (all strings unless noted; absent/empty = null):
--   event_id            Stripe event id, or null for non-webhook callers
--   event_type          'checkout.session.completed' etc., or 'app'
--   session_id          REQUIRED — Checkout Session id (business identity)
--   payment_intent_id
--   email               REQUIRED — payer email (payments.email is NOT NULL)
--   amount_cents        REQUIRED integer — Stripe amount_total
--   currency            lower-case ISO code
--   tournament_id, tournament_name, registration_id, drop_in_id, contact_id
--   confirm             boolean — caller validated amount/currency/event
--   review_note         text — why confirm is false (recorded on the rows)
--   team_name           optional — World Cup team name captured at checkout
--   notes_line          optional — line appended to registrations.notes on confirm
--
-- Returns jsonb:
--   outcome              'finalized' | 'recorded_needs_review' | 'duplicate_event'
--   payment_id, payment_inserted (bool), registration_updated (bool),
--   drop_in_updated (bool), registration_status (text|null)
create or replace function public.finalize_checkout_payment(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id          text    := nullif(p->>'event_id', '');
  v_event_type        text    := coalesce(nullif(p->>'event_type', ''), 'app');
  v_session_id        text    := nullif(p->>'session_id', '');
  v_payment_intent_id text    := nullif(p->>'payment_intent_id', '');
  v_email             text    := nullif(p->>'email', '');
  v_amount_cents      integer := (p->>'amount_cents')::integer;
  v_currency          text    := lower(coalesce(nullif(p->>'currency', ''), 'usd'));
  v_tournament_id     uuid    := nullif(p->>'tournament_id', '')::uuid;
  v_tournament_name   text    := nullif(p->>'tournament_name', '');
  v_registration_id   uuid    := nullif(p->>'registration_id', '')::uuid;
  v_drop_in_id        uuid    := nullif(p->>'drop_in_id', '')::uuid;
  v_contact_id        uuid    := nullif(p->>'contact_id', '')::uuid;
  v_confirm           boolean := coalesce((p->>'confirm')::boolean, false);
  v_review_note       text    := nullif(p->>'review_note', '');
  v_team_name         text    := nullif(p->>'team_name', '');
  v_notes_line        text    := nullif(p->>'notes_line', '');

  v_prev_processed    timestamptz;
  v_prev_outcome      text;
  v_payment_id        uuid;
  v_payment_inserted  boolean := false;
  v_reg_status        text;
  v_reg_cancelled     timestamptz;
  v_reg_updated       boolean := false;
  v_drop_updated      boolean := false;
  v_rows              integer;
  v_outcome           text;
begin
  if v_session_id is null then
    raise exception 'session_id is required' using errcode = '22023';
  end if;
  if v_email is null then
    raise exception 'email is required' using errcode = '22023';
  end if;
  if v_amount_cents is null or v_amount_cents < 0 then
    raise exception 'amount_cents is required' using errcode = '22023';
  end if;

  -- 4a. Delivery idempotency. Insert-or-lock the event row. If a previous
  --     delivery finished (processed_at set) we are a replay: converge nothing,
  --     answer 'duplicate_event'. If it started but never committed, the row
  --     does not exist (the earlier transaction rolled back), so we proceed.
  if v_event_id is not null then
    insert into public.stripe_webhook_events (id, type, object_id)
    values (v_event_id, v_event_type, v_session_id)
    on conflict (id) do nothing;

    select processed_at, outcome into v_prev_processed, v_prev_outcome
      from public.stripe_webhook_events
     where id = v_event_id
       for update;

    if v_prev_processed is not null then
      return jsonb_build_object(
        'outcome', 'duplicate_event',
        'previous_outcome', v_prev_outcome,
        'payment_inserted', false,
        'registration_updated', false,
        'drop_in_updated', false
      );
    end if;
  end if;

  -- 4b. Business uniqueness: one payments row per Checkout Session. An
  --     existing row keeps its amount/currency/status (Stripe wrote them the
  --     first time too); only missing links are filled in.
  -- Aliased `pay` (not `p`: that is this function's jsonb parameter and
  -- plpgsql would try to substitute it).
  insert into public.payments as pay
    (email, amount, currency, tournament_name, stripe_session_id,
     stripe_payment_intent_id, status, tournament_id, contact_id,
     registration_id, drop_in_id, notes)
  values
    (v_email, v_amount_cents / 100.0, v_currency, v_tournament_name, v_session_id,
     v_payment_intent_id, 'succeeded', v_tournament_id, v_contact_id,
     v_registration_id, v_drop_in_id, v_review_note)
  on conflict (stripe_session_id) do update
    set registration_id          = coalesce(pay.registration_id, excluded.registration_id),
        drop_in_id               = coalesce(pay.drop_in_id, excluded.drop_in_id),
        tournament_id            = coalesce(pay.tournament_id, excluded.tournament_id),
        contact_id               = coalesce(pay.contact_id, excluded.contact_id),
        stripe_payment_intent_id = coalesce(pay.stripe_payment_intent_id, excluded.stripe_payment_intent_id),
        status                   = case when pay.status = 'pending' then 'succeeded'
                                        else pay.status end,
        notes                    = public.append_note_line(pay.notes, excluded.notes)
  returning pay.id, (pay.xmax = 0) into v_payment_id, v_payment_inserted;

  -- 4c. Registration confirmation — convergent and idempotent.
  if v_registration_id is not null then
    select payment_status, cancelled_at
      into v_reg_status, v_reg_cancelled
      from public.registrations
     where id = v_registration_id
       for update;

    if found then
      if v_confirm then
        if v_reg_status in ('pending', 'partial') then
          update public.registrations
             set payment_status     = 'paid',
                 team_name          = coalesce(v_team_name, team_name),
                 notes              = public.append_note_line(
                                        public.append_note_line(notes, v_notes_line),
                                        case when v_reg_cancelled is not null
                                             then 'Stripe payment received AFTER this spot was cancelled — refund decision needed.'
                                             else null end),
                 needs_admin_review = case when v_reg_cancelled is not null then true
                                           else needs_admin_review end
           where id = v_registration_id;
          v_reg_updated := true;
          v_reg_status  := 'paid';
        elsif v_reg_status = 'paid' then
          -- Already confirmed (replay, success page after webhook, reconciler).
          null;
        else
          -- 'waived' / 'refunded': money arrived for a spot the owner settled
          -- another way. Never overwrite the owner's decision; flag it.
          update public.registrations
             set needs_admin_review = true,
                 notes = public.append_note_line(notes,
                           'Stripe payment received for a registration marked ' || v_reg_status || ' — review.')
           where id = v_registration_id;
        end if;
      else
        -- Caller could not validate the business facts (amount/currency/event
        -- mismatch, or no event to price against). The money is recorded on
        -- `payments`; the registration is NOT confirmed and is flagged.
        update public.registrations
           set needs_admin_review = true,
               notes = public.append_note_line(notes,
                         coalesce(v_review_note, 'Stripe payment could not be matched to this registration — review.'))
         where id = v_registration_id;
      end if;
    end if;
  end if;

  -- 4d. Drop-in confirmation (guest fee).
  if v_drop_in_id is not null and v_confirm then
    update public.drop_ins
       set payment_status = 'paid'
     where id = v_drop_in_id
       and payment_status = 'pending';
    get diagnostics v_rows = row_count;
    v_drop_updated := v_rows > 0;
  end if;

  v_outcome := case when v_confirm then 'finalized' else 'recorded_needs_review' end;

  -- 4e. Mark the delivery processed — inside the same transaction, so a
  --     failure anywhere above leaves no processed row and Stripe's retry
  --     starts clean.
  if v_event_id is not null then
    update public.stripe_webhook_events
       set processed_at = now(),
           outcome      = v_outcome,
           detail       = v_review_note
     where id = v_event_id;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'payment_id', v_payment_id,
    'payment_inserted', v_payment_inserted,
    'registration_updated', v_reg_updated,
    'registration_status', v_reg_status,
    'drop_in_updated', v_drop_updated
  );
end;
$$;

revoke all on function public.finalize_checkout_payment(jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_checkout_payment(jsonb)
  to service_role;
