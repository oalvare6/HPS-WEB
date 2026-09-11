-- Stage 2.3 item B: a record of every message the admin sends.
--
-- Stage 2.1 shipped message composition as an honest prototype — template,
-- recipients, editable text, no Send. This is the backend behind that button.
-- The transport already exists (`src/lib/email/resend-sender.ts`, chosen by the
-- operator 2026-09-09 for resume links); what did not exist is any record of
-- who was written to, whether it arrived, and what to do when it did not.
--
-- THE HARD PART IS NOT SENDING
--
-- It is sending exactly once. The owner runs events from a phone at the side of
-- a pitch; a double-tap that mails forty people twice is a real failure, and an
-- unrecoverable one — mail cannot be recalled. So idempotency is modelled here
-- rather than hoped for in the UI:
--
--   * A batch carries an `idempotency_key` minted by the composer when it opens.
--     Re-posting the same key returns the existing batch instead of creating a
--     second one, the same shape `finalize_checkout_payment` uses for Stripe
--     event ids.
--   * A recipient row is unique per (batch, email). One address gets one
--     message per batch, whatever the audience resolution did upstream.
--   * A row moves queued → sent exactly once. `mark_message_sent` refuses to
--     touch a row that is already 'sent', so a retry can never re-mail somebody
--     who already received it. Only 'failed' and 'queued' rows are retryable.
--
-- WHY OUTCOMES ARE PER RECIPIENT
--
-- A batch that is "80% delivered" is not a thing the owner can act on. Each
-- address carries its own status, error and attempt count, so a failure names a
-- person rather than a percentage — and a retry addresses only the ones that
-- failed. The DocuSeal webhook went a month never delivering because nobody
-- could see per-delivery outcomes; this is the same lesson applied forward.
--
-- NOT IN THIS MIGRATION, deliberately: scheduled or automated reminders. One
-- tap sending reliably comes first; automation on an unproven sender multiplies
-- the blast radius. Bounce/complaint callbacks from Resend are also absent —
-- `provider_id` is stored so they can be reconciled later, and until a webhook
-- exists 'sent' means "the provider accepted it", which is not the same as
-- "it arrived". The UI says so in those words.
--
-- Rollback (do NOT run without explicit approval; this is the only record of
-- what was sent to whom):
--   drop function if exists public.mark_message_sent(jsonb);
--   drop function if exists public.record_message_batch(jsonb);
--   drop table if exists public.message_recipients;
--   drop table if exists public.message_batches;

create extension if not exists pgcrypto;

create table if not exists public.message_batches (
  id              uuid        primary key default gen_random_uuid(),
  tournament_id   uuid        references public.tournaments(id) on delete set null,
  -- Which canned template it started from, or null for a message written from
  -- scratch. Kept for "what do we usually say", not for re-rendering.
  template        text,
  audience        text        not null,
  team_id         uuid        references public.teams(id) on delete set null,
  subject         text        not null check (btrim(subject) <> ''),
  body            text        not null check (btrim(body) <> ''),
  created_by      text        not null check (btrim(created_by) <> ''),
  created_at      timestamptz not null default now(),
  idempotency_key text        not null,
  constraint message_batches_idempotency_key unique (idempotency_key)
);

comment on table public.message_batches is
  'One row per message the admin sent. idempotency_key makes a double-tapped Send return the first batch rather than mail everybody twice.';

create index if not exists message_batches_tournament_idx
  on public.message_batches (tournament_id, created_at desc);

create table if not exists public.message_recipients (
  id              uuid        primary key default gen_random_uuid(),
  batch_id        uuid        not null references public.message_batches(id) on delete cascade,
  registration_id uuid        references public.registrations(id) on delete set null,
  contact_id      uuid        references public.contacts(id) on delete set null,
  email           text        not null,
  name            text,
  status          text        not null default 'queued'
                              check (status in ('queued', 'sent', 'failed', 'skipped')),
  -- Resend's message id, so a future bounce webhook can find this row.
  provider_id     text,
  error           text,
  attempts        integer     not null default 0 check (attempts >= 0),
  sent_at         timestamptz,
  updated_at      timestamptz not null default now(),
  constraint message_recipients_one_per_email unique (batch_id, email)
);

comment on table public.message_recipients is
  'Per-address outcome for one batch. A row moves queued -> sent exactly once; mark_message_sent refuses a row that is already sent, so a retry can never re-mail somebody who received it. "sent" means the provider accepted it, not that it arrived — there is no bounce webhook yet.';

create index if not exists message_recipients_batch_idx
  on public.message_recipients (batch_id, status);
create index if not exists message_recipients_registration_idx
  on public.message_recipients (registration_id) where registration_id is not null;

alter table public.message_batches enable row level security;
alter table public.message_recipients enable row level security;
revoke all on public.message_batches from anon, authenticated;
revoke all on public.message_recipients from anon, authenticated;

/*
  Create a batch and its queued recipients in one transaction, or return the
  batch that already exists for this idempotency key.

  Keys: idempotency_key, tournament_id, template, audience, team_id, subject,
        body, created_by, recipients [{registration_id, contact_id, email, name}].

  Returns { batch_id, created, queued } — `created` false means this was a
  repeat and nothing new was queued.
*/
create or replace function public.record_message_batch(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key     text := nullif(btrim(p->>'idempotency_key'), '');
  v_subject text := nullif(btrim(p->>'subject'), '');
  v_body    text := nullif(btrim(p->>'body'), '');
  v_by      text := nullif(btrim(p->>'created_by'), '');
  v_audience text := nullif(btrim(p->>'audience'), '');
  v_batch   uuid;
  v_queued  integer := 0;
begin
  if v_key is null then
    raise exception 'idempotency_key is required' using errcode = '22023';
  end if;
  if v_subject is null or v_body is null then
    raise exception 'A message needs a subject and a body.' using errcode = '22023';
  end if;
  if v_by is null then
    raise exception 'created_by is required' using errcode = '22023';
  end if;
  if v_audience is null then
    raise exception 'audience is required' using errcode = '22023';
  end if;

  -- The repeat case. Insert-or-nothing, then read back: whoever lost the race
  -- gets the winner's batch rather than an error.
  insert into public.message_batches
    (tournament_id, template, audience, team_id, subject, body, created_by, idempotency_key)
  values (
    nullif(p->>'tournament_id', '')::uuid,
    nullif(btrim(p->>'template'), ''),
    v_audience,
    nullif(p->>'team_id', '')::uuid,
    v_subject, v_body, v_by, v_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_batch;

  if v_batch is null then
    select id into v_batch from public.message_batches where idempotency_key = v_key;
    return jsonb_build_object('batch_id', v_batch, 'created', false, 'queued', 0);
  end if;

  insert into public.message_recipients (batch_id, registration_id, contact_id, email, name)
  select v_batch,
         nullif(r->>'registration_id', '')::uuid,
         nullif(r->>'contact_id', '')::uuid,
         lower(btrim(r->>'email')),
         nullif(btrim(r->>'name'), '')
    from jsonb_array_elements(coalesce(p->'recipients', '[]'::jsonb)) as r
   where btrim(coalesce(r->>'email', '')) <> ''
  on conflict (batch_id, email) do nothing;

  get diagnostics v_queued = row_count;

  if v_queued = 0 then
    raise exception 'A message needs at least one recipient with an email address.'
      using errcode = '22023';
  end if;

  return jsonb_build_object('batch_id', v_batch, 'created', true, 'queued', v_queued);
end;
$$;

/*
  Record what the provider said about one address.

  Keys: id, status ('sent' | 'failed'), provider_id, error.

  A row already 'sent' is never changed — that is the guard that makes a retry
  safe. The caller is told it was already sent rather than being given an error,
  because at that point the desired state is the actual state.
*/
create or replace function public.mark_message_sent(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_status  text := nullif(btrim(p->>'status'), '');
  v_current text;
begin
  if v_id is null then
    raise exception 'id is required' using errcode = '22023';
  end if;
  if v_status is null or v_status not in ('sent', 'failed') then
    raise exception 'status must be sent or failed' using errcode = '22023';
  end if;

  select status into v_current
    from public.message_recipients
   where id = v_id
     for update;
  if not found then
    raise exception 'That recipient row does not exist.' using errcode = 'P0002';
  end if;

  if v_current = 'sent' then
    return jsonb_build_object('id', v_id, 'status', 'sent', 'already_sent', true);
  end if;

  update public.message_recipients
     set status      = v_status,
         provider_id = coalesce(nullif(p->>'provider_id', ''), provider_id),
         error       = case when v_status = 'sent' then null
                            else nullif(btrim(p->>'error'), '') end,
         attempts    = attempts + 1,
         sent_at     = case when v_status = 'sent' then now() else sent_at end,
         updated_at  = now()
   where id = v_id;

  return jsonb_build_object('id', v_id, 'status', v_status, 'already_sent', false);
end;
$$;

revoke all on function public.record_message_batch(jsonb) from public, anon, authenticated;
revoke all on function public.mark_message_sent(jsonb) from public, anon, authenticated;
grant execute on function public.record_message_batch(jsonb) to service_role;
grant execute on function public.mark_message_sent(jsonb) to service_role;
