-- Two settlement defects found by EXECUTING the function (Stage 1.4):
-- a link that was cleaned up afterwards could discard a payment, and two
-- payments for one registration could deadlock each other.
--
-- ===========================================================================
-- DEFECT 2: a lock upgrade that deadlocks (fixed first, because it explains
--           the shape of the new code)
-- ===========================================================================
--
-- `payments` has a foreign key to `registrations`, so inserting the ledger row
-- takes a FOR KEY SHARE lock on the registration. Step 4c then asks the same
-- row for FOR UPDATE — a lock UPGRADE. Two settlements for the same
-- registration therefore both hold KEY SHARE, and both wait for the other to
-- release it:
--
--     T1: insert payments (KEY SHARE on reg R) ─┐
--     T2: insert payments (KEY SHARE on reg R) ─┤ compatible, both proceed
--     T1: select … R … for update  ────────────▶ waits for T2
--     T2: select … R … for update  ────────────▶ waits for T1   → 40P01
--
-- Reproduced on a real server: 1 of 12 concurrent pairs raised
-- `deadlock detected`. Postgres kills one side, the function raises, the webhook
-- answers 500 and Stripe retries — so no money is lost — but it is a real 5xx on
-- a payment path, and production already holds two registrations carrying two
-- succeeded payments each, which is exactly the shape that races.
--
-- The fix is lock ORDER, not more locking: take FOR UPDATE on the registration
-- (and the drop-in, which has the same shape via 4d) BEFORE inserting the
-- payment. Both transactions then queue on the same lock in the same order and
-- one simply waits. No upgrade, no cycle.
--
-- ===========================================================================
-- DEFECT 1: settlement must not be defeated by a link that was cleaned up
-- ===========================================================================
--
-- ## The defect (found 2026-09-10 by executing the function, Stage 1.4)
--
-- `finalize_checkout_payment` writes registration_id, drop_in_id, contact_id and
-- tournament_id straight into `payments`, which has a foreign key on all four.
-- Two of those ids are re-read from the database by the application before the
-- call (src/lib/payment-finalize.ts loads the registration and the drop-in and
-- passes null when either is gone). The other two are NOT:
--
--     contact_id     = metadata.contact_id ?? registration.contact_id ?? …
--     tournament_id  = registration.tournament_id ?? drop_in.tournament_id ?? metadata.tournament_id
--
-- Stripe metadata is frozen at checkout. The admin can delete a contact
-- (/api/admin/contacts/[id]) and does delete one on every contact MERGE
-- (/api/admin/contacts/merge) — which is exactly what the 2026-08-17 production
-- data cleanup did — and it can delete a tournament. After that, the id in an
-- old session's metadata names a row that no longer exists, and the insert
-- raises 23503.
--
-- Because the whole function is one transaction, that rolls back the payment
-- too. The consequences, in ascending order of how much they cost:
--
--   * the webhook answers 500 so Stripe retries — and every retry for the next
--     three days fails identically, because metadata never changes. The money
--     is never recorded locally at all. That is strictly worse than the F-02
--     bug this system was built to fix, which at least recorded the payment.
--   * /api/admin/sync-payments walks the last 100 Checkout Sessions, so one
--     merged contact can make the owner's "sync payments" button fail on a
--     session from months ago.
--   * scripts/reconcile-payments.ts reprocesses up to 90 days of sessions, so
--     the repair tool can be stopped by the same row.
--
-- ## The rule this restores
--
-- The money moved; recording it is not optional. A link that cannot be honoured
-- is dropped and written down, never allowed to discard the payment. Settlement
-- degrades to "recorded, flagged for the owner" — the same place every other
-- unverifiable fact already lands — instead of failing.
--
-- ## Shape of the change
--
-- CREATE OR REPLACE of the existing function. Purely additive: no table is
-- altered, the signature, the return shape and every existing branch are
-- unchanged, and a caller that never sends a stale id sees identical behaviour.
-- Safe in either deploy order — old application code calling the new function
-- gets the tolerance for free.
--
-- Rollback: re-apply the body from 20260909120100_stripe_payment_finalization.sql.
--
-- Verified by scripts/test-finalize-sql.ts and scripts/test-stripe-integration.ts
-- against a real PostgreSQL.

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
  v_reg_found         boolean := false;
  v_drop_found        boolean := false;
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

  -- 4a-bis. NEW: lock the rows this settlement will update, BEFORE the insert
  --     that would otherwise take a weaker lock on the same rows — and treat a
  --     row that is not there as a link to drop rather than an error to raise.
  --
  --     Lock order (defect 2). The payments insert acquires FOR KEY SHARE on the
  --     registration and the drop-in through the foreign keys; asking for FOR
  --     UPDATE afterwards is an upgrade, and two concurrent settlements for one
  --     registration deadlock on it. Taking FOR UPDATE first makes them queue.
  --     The values read here are the ones 4c acts on: while this transaction
  --     holds the lock, nothing else can change the row.
  --
  --     Link tolerance (defect 1). `payments` has a foreign key on all four ids.
  --     Writing one that no longer exists raises 23503 and takes the payment
  --     down with it — permanently, for any caller whose input is frozen, which
  --     Stripe metadata is. Recording the money outranks recording the link, so
  --     an unresolvable link becomes null plus a note. The FOR UPDATE that
  --     precedes each check is also what makes the check safe: the row cannot be
  --     deleted between here and the insert.
  if v_registration_id is not null then
    select payment_status, cancelled_at
      into v_reg_status, v_reg_cancelled
      from public.registrations
     where id = v_registration_id
       for update;
    v_reg_found := found;

    if not v_reg_found then
      v_review_note := public.append_note_line(
        v_review_note,
        'Stripe session named registration ' || v_registration_id || ', which no longer exists — payment recorded unlinked.'
      );
      v_registration_id := null;
      -- There is nothing left to confirm; say so rather than reporting success.
      v_confirm := false;
    end if;
  end if;

  if v_drop_in_id is not null then
    perform 1 from public.drop_ins where id = v_drop_in_id for update;
    v_drop_found := found;

    if not v_drop_found then
      v_review_note := public.append_note_line(
        v_review_note,
        'Stripe session named drop-in ' || v_drop_in_id || ', which no longer exists — payment recorded unlinked.'
      );
      v_drop_in_id := null;
      v_confirm := false;
    end if;
  end if;

  -- contacts and tournaments are never UPDATEd here, so they need no FOR UPDATE
  -- — but a bare existence check would still be racy: a delete committing
  -- between the check and the insert puts us back in the 23503 case the check
  -- exists to avoid. FOR KEY SHARE is exactly the lock the foreign key takes at
  -- insert time anyway, so taking it now makes check-then-insert atomic without
  -- blocking anything the FK would not have blocked.
  if v_contact_id is not null then
    perform 1 from public.contacts where id = v_contact_id for key share;
    if not found then
      -- A merged-away contact says nothing about whether the player paid, so
      -- this one does NOT withdraw confirmation.
      v_review_note := public.append_note_line(
        v_review_note,
        'Stripe session named contact ' || v_contact_id || ', which no longer exists (merged or deleted) — payment recorded without it.'
      );
      v_contact_id := null;
    end if;
  end if;

  if v_tournament_id is not null then
    perform 1 from public.tournaments where id = v_tournament_id for key share;
    if not found then
      v_review_note := public.append_note_line(
        v_review_note,
        'Stripe session named event ' || v_tournament_id || ', which no longer exists — payment recorded without it.'
      );
      v_tournament_id := null;
      v_confirm := false;
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

  -- 4c. Registration confirmation — convergent and idempotent. The row was
  --     read and locked in 4a-bis; re-reading it here with FOR UPDATE is the
  --     lock upgrade this migration exists to remove.
  if v_registration_id is not null then
    if v_reg_found then
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

-- `append_note_line` was created without a revoke/grant block, so it kept
-- PostgreSQL's default of EXECUTE to PUBLIC while its two siblings are
-- service_role-only. It is immutable, takes and returns text, reads nothing and
-- writes nothing, so nothing is exposed by it — but "every settlement function
-- is service_role-only" should be true as stated rather than true for two of
-- three. `finalize_checkout_payment` is SECURITY INVOKER, so the grant to
-- service_role is what keeps it callable.
revoke all on function public.append_note_line(text, text)
  from public, anon, authenticated;
grant execute on function public.append_note_line(text, text)
  to service_role;
