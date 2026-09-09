-- Stage 1.3 (SEC-02): a replay-safe ledger for DocuSeal completion deliveries.
--
-- ## Why
--
-- `POST /api/docuseal/webhook` used to be idempotent only by accident — a
-- duplicate delivery re-ran the same UPDATE, and a payload without
-- `completed_at` would have re-stamped `waiver_signed_at = now()` and quietly
-- extended a waiver's validity. DocuSeal retries any response >= 400 up to 12
-- times, so deliveries WILL repeat. This table records each logical event once
-- (`form.completed:<submitter id>` — a submitter completes a form exactly once)
-- and lets the handler answer a replay with 200 without writing anything.
--
-- ## What this adds (purely additive; nothing existing is altered)
--
--   docuseal_webhook_events              one row per logical delivery
--   claim_docuseal_webhook_event(...)    atomic claim: exactly one delivery may
--                                        hold an unprocessed claim on a key
--
-- Marking a claim processed is a plain UPDATE by the application. A claim that
-- is never marked processed (the function died mid-write) is taken over by a
-- retry once it is older than the stale window the caller passes.
--
-- ## Rollout / rollback
--
-- Old application code never reads these objects; applying this before the
-- code ships is safe. New code answers 500 (DocuSeal retries) if the function
-- is missing, and never writes waiver state without a claim. Rollback is an
-- application rollback; keep the table — it is the delivery audit trail.
--
-- Targets the production structure in docs/core_schema_snapshot.sql
-- (registrations.id uuid PK). Apply by hand / MCP; do NOT `db push` until the
-- migration ledger is repaired (docs/core_schema_diff.md §3).

create table if not exists public.docuseal_webhook_events (
  event_key        text        primary key,
  event_type       text        not null,
  submitter_id     bigint,
  submission_id    bigint,
  registration_id  uuid        references public.registrations(id) on delete set null,
  first_seen_at    timestamptz not null default now(),
  claimed_at       timestamptz not null default now(),
  processed_at     timestamptz,
  outcome          text,
  detail           text,
  attempts         integer     not null default 1,
  constraint docuseal_webhook_events_attempts_check check (attempts >= 1)
);

create index if not exists docuseal_webhook_events_submission_idx
  on public.docuseal_webhook_events (submission_id);
create index if not exists docuseal_webhook_events_registration_idx
  on public.docuseal_webhook_events (registration_id)
  where registration_id is not null;

comment on table public.docuseal_webhook_events is
  'One row per logical DocuSeal webhook event (event_key = "<event_type>:<submitter id>"). A delivery may write waiver state only while it holds the claim; processed_at set = done, replays are acknowledged without writing.';

-- RLS on, no policies: service role only, like every other PII-adjacent table.
alter table public.docuseal_webhook_events enable row level security;
revoke all on public.docuseal_webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------
-- INSERT ... ON CONFLICT DO NOTHING is the concurrency story: a second
-- delivery for the same key inserts nothing, then blocks on SELECT ... FOR
-- UPDATE until the first delivery's transaction ends, and reads the row's
-- final state. processed_at set → duplicate; fresh unprocessed claim →
-- in_flight (the caller answers 503 and DocuSeal retries later); stale
-- unprocessed claim → reclaimed (the earlier delivery died mid-write).
create or replace function public.claim_docuseal_webhook_event(
  p_event_key           text,
  p_event_type          text,
  p_submitter_id        bigint,
  p_submission_id       bigint,
  p_registration_id     uuid,
  p_stale_after_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted   text;
  v_processed  timestamptz;
  v_claimed    timestamptz;
  v_outcome    text;
begin
  if p_event_key is null or length(p_event_key) = 0 then
    raise exception 'event key is required' using errcode = '22023';
  end if;

  insert into public.docuseal_webhook_events
    (event_key, event_type, submitter_id, submission_id, registration_id)
  values
    (p_event_key, p_event_type, p_submitter_id, p_submission_id, p_registration_id)
  on conflict (event_key) do nothing
  returning event_key into v_inserted;

  if v_inserted is not null then
    return jsonb_build_object('status', 'claimed');
  end if;

  select processed_at, claimed_at, outcome
    into v_processed, v_claimed, v_outcome
    from public.docuseal_webhook_events
   where event_key = p_event_key
     for update;

  if v_processed is not null then
    return jsonb_build_object('status', 'duplicate', 'previous_outcome', v_outcome);
  end if;

  if v_claimed < now() - make_interval(secs => coalesce(p_stale_after_seconds, 120)) then
    update public.docuseal_webhook_events
       set claimed_at = now(),
           attempts   = attempts + 1,
           detail     = null,
           registration_id = coalesce(registration_id, p_registration_id)
     where event_key = p_event_key;
    return jsonb_build_object('status', 'reclaimed');
  end if;

  return jsonb_build_object('status', 'in_flight');
end;
$$;

revoke all on function public.claim_docuseal_webhook_event(text, text, bigint, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_docuseal_webhook_event(text, text, bigint, bigint, uuid, integer)
  to service_role;
