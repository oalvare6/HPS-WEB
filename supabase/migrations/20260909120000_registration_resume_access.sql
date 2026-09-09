-- F-01 remediation: registration resume access (magic link → one-time token →
-- server-side session), plus a durable throttle for link requests.
--
-- ## Why
--
-- backend_audit_v1.md F-01: POST /api/pay/eligibility returned a 90-day HMAC
-- pay-resume token to anyone who typed a registrant's email address. That token
-- authorised cancelling the spot, declaring a payment method, reading the
-- registrant's email and first name, and signing a youth waiver. Knowing an
-- email address must never *authorise* access to a registration.
--
-- ## What this adds (purely additive; nothing existing is altered)
--
--   registration_access_tokens  one-time magic-link tokens, stored HASHED
--   registration_sessions       resume sessions minted by a successful exchange,
--                               stored HASHED, scoped to ONE registration
--   resume_link_requests        durable request log keyed by email/IP digests,
--                               used to throttle link requests (defence in
--                               depth — never the authorisation mechanism)
--   consume_registration_access_token(...)   atomic, concurrency-safe exchange
--   record_resume_link_request(...)          atomic throttle check + record
--
-- Raw tokens never touch the database. The application generates ≥256 bits of
-- randomness, sends the raw value in the email / sets it in an HttpOnly cookie,
-- and stores only sha256(raw). A database read therefore yields nothing usable.
--
-- ## Rollout / rollback
--
-- Old application code never reads these objects, so applying this before the
-- code ships is safe. New code fails closed (500 "not configured") if the
-- function is missing. Rollback is an application rollback; leave the tables in
-- place — they hold the audit trail of who was issued a link and when.
--
-- Targets the production structure recorded in docs/core_schema_snapshot.sql
-- (registrations.id uuid PK). Apply by hand / MCP; do NOT run `db push` until
-- the migration ledger is repaired (docs/core_schema_diff.md §3).

-- ---------------------------------------------------------------------------
-- 1. One-time access tokens (the magic link)
-- ---------------------------------------------------------------------------
create table if not exists public.registration_access_tokens (
  id               uuid        primary key default gen_random_uuid(),
  registration_id  uuid        not null
                               references public.registrations(id) on delete cascade,
  token_hash       text        not null,
  purpose          text        not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  revoked_at       timestamptz,
  -- Where the request came from, hashed. Enough to investigate abuse, not
  -- enough to identify a person from the table alone.
  requester_ip_digest text,
  constraint registration_access_tokens_token_hash_key unique (token_hash),
  constraint registration_access_tokens_purpose_check
    check (purpose in ('resume')),
  constraint registration_access_tokens_expiry_check
    check (expires_at > created_at)
);

create index if not exists registration_access_tokens_registration_idx
  on public.registration_access_tokens (registration_id, created_at desc);

comment on table public.registration_access_tokens is
  'One-time magic-link tokens for resuming a registration. token_hash = sha256(raw). Consumed exactly once via consume_registration_access_token().';

-- ---------------------------------------------------------------------------
-- 2. Resume sessions (what the cookie refers to)
-- ---------------------------------------------------------------------------
create table if not exists public.registration_sessions (
  id               uuid        primary key default gen_random_uuid(),
  registration_id  uuid        not null
                               references public.registrations(id) on delete cascade,
  token_hash       text        not null,
  scopes           text[]      not null default '{}'::text[],
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  access_token_id  uuid
                   references public.registration_access_tokens(id) on delete set null,
  constraint registration_sessions_token_hash_key unique (token_hash),
  constraint registration_sessions_expiry_check
    check (expires_at > created_at)
);

create index if not exists registration_sessions_registration_idx
  on public.registration_sessions (registration_id, created_at desc);

comment on table public.registration_sessions is
  'Server-side resume sessions. The cookie carries the raw secret; only sha256(raw) is stored. A session is valid while revoked_at is null and expires_at > now().';

-- ---------------------------------------------------------------------------
-- 3. Durable throttle for link requests
-- ---------------------------------------------------------------------------
-- Keyed by digests, not plaintext: the application already holds the email on
-- contacts/registrations, and this table must not become a third plaintext copy.
create table if not exists public.resume_link_requests (
  id            bigint      generated always as identity primary key,
  email_digest  text        not null,
  ip_digest     text,
  requested_at  timestamptz not null default now()
);

create index if not exists resume_link_requests_email_idx
  on public.resume_link_requests (email_digest, requested_at desc);
create index if not exists resume_link_requests_ip_idx
  on public.resume_link_requests (ip_digest, requested_at desc)
  where ip_digest is not null;

comment on table public.resume_link_requests is
  'Accepted magic-link requests, keyed by sha256(normalised email) and sha256(client ip). Rows older than two days are swept opportunistically by record_resume_link_request().';

-- ---------------------------------------------------------------------------
-- 4. RLS: enabled, no policies. Service role only (same posture as every
--    other PII table in this database — see docs/core_schema_snapshot.sql).
-- ---------------------------------------------------------------------------
alter table public.registration_access_tokens enable row level security;
alter table public.registration_sessions      enable row level security;
alter table public.resume_link_requests       enable row level security;

revoke all on public.registration_access_tokens from anon, authenticated;
revoke all on public.registration_sessions      from anon, authenticated;
revoke all on public.resume_link_requests       from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Atomic, concurrency-safe token exchange
-- ---------------------------------------------------------------------------
-- The single UPDATE ... WHERE consumed_at IS NULL is the whole concurrency
-- story: under READ COMMITTED a second concurrent caller blocks on the row
-- lock, re-evaluates the WHERE clause after the first commits, sees
-- consumed_at set, matches zero rows and receives {ok:false}. Exactly one
-- session is ever created per token.
create or replace function public.consume_registration_access_token(
  p_token_hash          text,
  p_purpose             text,
  p_session_token_hash  text,
  p_scopes              text[],
  p_session_ttl_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token_id        uuid;
  v_registration_id uuid;
  v_expires_at      timestamptz;
  v_session_id      uuid;
begin
  if p_token_hash is null or p_session_token_hash is null then
    raise exception 'token hashes are required' using errcode = '22023';
  end if;
  if p_session_ttl_seconds is null or p_session_ttl_seconds < 60 then
    raise exception 'session ttl must be at least 60 seconds' using errcode = '22023';
  end if;

  update public.registration_access_tokens
     set consumed_at = now()
   where token_hash = p_token_hash
     and purpose = p_purpose
     and consumed_at is null
     and revoked_at is null
     and expires_at > now()
  returning id, registration_id
    into v_token_id, v_registration_id;

  if v_token_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_expires_at := now() + make_interval(secs => p_session_ttl_seconds);

  insert into public.registration_sessions
    (registration_id, token_hash, scopes, expires_at, access_token_id)
  values
    (v_registration_id, p_session_token_hash, coalesce(p_scopes, '{}'::text[]),
     v_expires_at, v_token_id)
  returning id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'registration_id', v_registration_id,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.consume_registration_access_token(text, text, text, text[], integer)
  from public, anon, authenticated;
grant execute on function public.consume_registration_access_token(text, text, text, text[], integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Atomic throttle: check the windows and record the request in one step
-- ---------------------------------------------------------------------------
-- Design notes:
--  * Per-email cooldown + per-email hourly cap + per-IP hourly cap.
--  * Only ACCEPTED requests are recorded, so an attacker hammering one address
--    cannot inflate that address's hourly count beyond the cap and lock the
--    real person out for longer than one window. Sustained abuse from many IPs
--    can still suppress one address for up to an hour; that is the accepted
--    trade-off versus turning the endpoint into a spam cannon.
--  * The advisory lock serialises callers on the same email digest so two
--    simultaneous requests cannot both slip under the cooldown.
create or replace function public.record_resume_link_request(
  p_email_digest           text,
  p_ip_digest              text,
  p_email_cooldown_seconds integer,
  p_email_hourly_max       integer,
  p_ip_hourly_max          integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last       timestamptz;
  v_email_hour integer;
  v_ip_hour    integer;
begin
  if p_email_digest is null or length(p_email_digest) = 0 then
    raise exception 'email digest is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_email_digest));

  -- Opportunistic sweep: keep the table small without a scheduler.
  delete from public.resume_link_requests
   where requested_at < now() - interval '2 days';

  select max(requested_at) into v_last
    from public.resume_link_requests
   where email_digest = p_email_digest;

  if v_last is not null
     and v_last > now() - make_interval(secs => coalesce(p_email_cooldown_seconds, 60)) then
    return jsonb_build_object('allowed', false, 'reason', 'email_cooldown');
  end if;

  select count(*) into v_email_hour
    from public.resume_link_requests
   where email_digest = p_email_digest
     and requested_at > now() - interval '1 hour';

  if v_email_hour >= coalesce(p_email_hourly_max, 6) then
    return jsonb_build_object('allowed', false, 'reason', 'email_hourly');
  end if;

  if p_ip_digest is not null then
    select count(*) into v_ip_hour
      from public.resume_link_requests
     where ip_digest = p_ip_digest
       and requested_at > now() - interval '1 hour';

    if v_ip_hour >= coalesce(p_ip_hourly_max, 12) then
      return jsonb_build_object('allowed', false, 'reason', 'ip_hourly');
    end if;
  end if;

  insert into public.resume_link_requests (email_digest, ip_digest)
  values (p_email_digest, p_ip_digest);

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.record_resume_link_request(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_resume_link_request(text, text, integer, integer, integer)
  to service_role;
