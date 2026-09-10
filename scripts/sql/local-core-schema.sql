-- ============================================================================
-- LOCAL TEST SCHEMA — a faithful stand-in for the production core, so that the
-- F-02 settlement functions can be EXECUTED instead of merely reviewed.
-- ============================================================================
-- Stage 1.4. `remediation_stage_1_2_report.md` §8 and §17.1 admit the gap this
-- file closes: `finalize_checkout_payment` and `record_stripe_webhook_event`
-- were written, reviewed by hand and mirrored in `scripts/_test-fakes.ts`, but
-- never run against any PostgreSQL. Everything green was green against a fake.
--
-- This file is DERIVED FROM `docs/core_schema_snapshot.sql` (the read-only
-- introspection of production, PostgreSQL 17.6). It is a TEST FIXTURE and must
-- never be placed in supabase/migrations/ or applied to any hosted project.
-- It is applied to a throwaway local database by
-- `scripts/local-postgres.ts`, which then applies the two real migration files
-- verbatim on top of it.
--
-- What is reproduced exactly, because settlement depends on it:
--   * every column, type, default, CHECK constraint, FOREIGN KEY and UNIQUE
--     index on registrations / payments / drop_ins / tournaments that
--     `finalize_checkout_payment` reads or writes — including
--     payments_stripe_session_id_key and the PARTIAL unique index on
--     stripe_payment_intent_id, which is what turns a second session sharing
--     one PaymentIntent into a 23505 instead of a duplicate ledger row;
--   * registrations_one_live_spot_idx, so a test can prove settlement never
--     creates a second live spot;
--   * the updated_at triggers (payments deliberately has none in production);
--   * RLS enabled on every table with the production policy set, and the three
--     Supabase roles, so the migration's REVOKE/GRANT block applies as written
--     and can be asserted.
--
-- What is deliberately simplified, and why it cannot affect the result:
--   * `tournament_rounds` is a stub with only the columns drop_ins references
--     (it exists here only so drop_ins' FK is real);
--   * matches, scorers, waiver tables and site content beyond site_settings
--     are omitted — no settlement path reads them;
--   * `auth.users` and the Supabase auth schema are omitted — settlement never
--     touches them.
--
-- Version note: production is PostgreSQL 17.6.1; this fixture is exercised on
-- whatever local server is available (16.13 in the sandbox). Every construct
-- used by the migrations is stable across both, and
-- `scripts/test-finalize-sql.ts` asserts the two that carry any version risk
-- (`xmax = 0` after ON CONFLICT, and FOR UPDATE re-read under READ COMMITTED)
-- against the live server rather than assuming them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles. Supabase ships these three; `service_role` bypasses RLS, which is how
-- the application reaches every table in this file.
-- ---------------------------------------------------------------------------
-- Attributes and per-role settings verified against production's pg_roles on
-- 2026-09-10. The settings are not decoration: PostgREST logs in as
-- `authenticator` and then issues SET ROLE, and SET ROLE does NOT re-apply
-- role settings — so every application statement, service_role included, runs
-- under authenticator's `statement_timeout = 8s` and `lock_timeout = 8s`.
-- A concurrency test run as a superuser with no timeouts is being made under
-- different rules from the ones production enforces.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- The role PostgREST actually connects as. LOGIN here (production uses a
  -- password; this cluster is trust-auth and throwaway) so a test can take the
  -- production path: connect as authenticator, SET ROLE service_role.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

alter role anon           set statement_timeout = '3s';
alter role authenticated  set statement_timeout = '8s';
alter role authenticator  set statement_timeout = '8s';
alter role authenticator  set lock_timeout = '8s';
grant anon, authenticated, service_role to authenticator;

-- Reset. The extension is created AFTER the schema, not before: citext installs
-- into `public`, so creating it first and then dropping the schema takes the
-- type with it (and the failure surfaces 90 lines later as
-- `type "citext" does not exist`).
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;

create extension if not exists citext with schema public;

-- ---------------------------------------------------------------------------
-- updated_at trigger function (production has per-table clones with identical
-- bodies; one shared function is behaviourally the same)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tournaments (the "events" table)
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id                         uuid        not null default gen_random_uuid(),
  title                      text        not null,
  slug                       text        not null,
  status                     text        not null default 'upcoming',
  registration_open          boolean     not null default false,
  payments_open              boolean     not null default false,
  description                text,
  start_date                 timestamptz,
  end_date                   timestamptz,
  time_start                 text,
  time_end                   text,
  recurrence                 text,
  location                   text,
  format                     text,
  entry_fee                  numeric(10,2),
  max_teams                  integer,
  image_url                  text,
  image_preset               text,
  register_url               text,
  pay_url                    text,
  display_order              integer     not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  is_featured                boolean     not null default false,
  entry_fee_cents            integer,
  drop_in_fee_cents          integer     not null default 2000,
  stripe_product_id          text,
  stripe_price_id            text,
  is_draft                   boolean     not null default false,
  kind                       text        not null default 'tournament',
  free_entry_tournament_ids  uuid[]      not null default '{}'::uuid[],
  constraint tournaments_pkey primary key (id),
  constraint tournaments_slug_key unique (slug),
  constraint tournaments_status_check
    check (status = any (array['upcoming','ongoing','completed','cancelled'])),
  constraint tournaments_kind_check
    check (kind = any (array['tournament','open_play'])),
  constraint tournaments_entry_fee_cents_check
    check (entry_fee_cents is null or entry_fee_cents >= 0),
  constraint tournaments_drop_in_fee_cents_check
    check (drop_in_fee_cents >= 0)
);
create trigger tournaments_set_updated_at before update on public.tournaments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contacts (canonical person; email is the identity today — citext)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id                    uuid        not null default gen_random_uuid(),
  first_name            text        not null,
  last_name             text        not null,
  email                 citext      not null,
  phone                 text,
  dob                   date,
  notes                 text,
  tags                  text[]      not null default '{}'::text[],
  marketing_opt_in      boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  waiver_type           text,
  waiver_signed_at      timestamptz,
  waiver_expires_at     timestamptz,
  waiver_document_url   text,
  waiver_submission_id  integer,
  waiver_source         text,
  emergency_name        text,
  emergency_phone       text,
  constraint contacts_pkey primary key (id),
  constraint contacts_waiver_type_check
    check (waiver_type is null or waiver_type = any (array['adult','youth'])),
  constraint contacts_waiver_source_check
    check (waiver_source is null or waiver_source = any (array['docuseal','admin_override','import','in_app']))
);
create unique index contacts_email_unique_idx on public.contacts (email);
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table public.teams (
  id                  uuid        not null default gen_random_uuid(),
  tournament_id       uuid        not null,
  name                text        not null,
  captain_contact_id  uuid,
  color               text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint teams_pkey primary key (id),
  constraint teams_tournament_id_fkey foreign key (tournament_id) references public.tournaments(id) on delete cascade,
  constraint teams_captain_contact_id_fkey foreign key (captain_contact_id) references public.contacts(id) on delete set null
);
create unique index teams_tournament_name_unique_idx on public.teams (tournament_id, lower(name));
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tournament_rounds — STUB. Only drop_ins.round_id references it; no
-- settlement path reads a round.
-- ---------------------------------------------------------------------------
create table public.tournament_rounds (
  id             uuid        not null default gen_random_uuid(),
  tournament_id  uuid        not null,
  created_at     timestamptz not null default now(),
  constraint tournament_rounds_pkey primary key (id),
  constraint tournament_rounds_tournament_id_fkey foreign key (tournament_id) references public.tournaments(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- registrations (the roster: one live row per person per event)
-- ---------------------------------------------------------------------------
create table public.registrations (
  id                         uuid        not null default gen_random_uuid(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  registration_type          text        not null,
  first_name                 text        not null,
  last_name                  text        not null,
  email                      text        not null,
  phone                      text        not null,
  dob                        date        not null,
  emergency_name             text        not null,
  emergency_phone            text        not null,
  team_name                  text,
  waiver_type                text        not null,
  waiver_signed              boolean     not null default false,
  waiver_signed_at           timestamptz,
  waiver_submission_id       text,
  waiver_match_key           uuid        not null default gen_random_uuid(),
  payment_status             text        not null default 'pending',
  payment_method             text,
  payment_amount             numeric(10,2),
  notes                      text,
  docuseal_submission_id     integer,
  docuseal_sign_url          text,
  docuseal_status            text        not null default 'pending',
  waiver_document_url        text,
  tournament_id              uuid,
  contact_id                 uuid,
  team_id                    uuid,
  needs_admin_review         boolean     not null default false,
  cancelled_at               timestamptz,
  free_entry_tournament_id   uuid,
  constraint registrations_pkey primary key (id),
  constraint registrations_tournament_id_fkey foreign key (tournament_id) references public.tournaments(id) on delete set null,
  constraint registrations_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null,
  constraint registrations_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null,
  constraint registrations_free_entry_tournament_id_fkey foreign key (free_entry_tournament_id) references public.tournaments(id) on delete set null,
  constraint registrations_registration_type_check
    check (registration_type = any (array['team','adult','youth','freeagent'])),
  constraint registrations_waiver_type_check
    check (waiver_type = any (array['adult','youth'])),
  constraint registrations_payment_status_check
    check (payment_status = any (array['pending','paid','partial','waived','refunded'])),
  constraint registrations_docuseal_status_check
    check (docuseal_status = any (array['pending','sent','signed']))
);
create unique index registrations_waiver_match_key_idx on public.registrations (waiver_match_key);
-- The roster invariant: settlement must never be able to create a second live spot.
create unique index registrations_one_live_spot_idx on public.registrations (tournament_id, contact_id)
  where cancelled_at is null and contact_id is not null;
create index registrations_email_tournament_idx on public.registrations (email, tournament_id) where email is not null;
create index registrations_needs_admin_review_idx on public.registrations (needs_admin_review) where needs_admin_review = true;
create index registrations_payment_status_idx on public.registrations (payment_status);
create trigger registrations_set_updated_at before update on public.registrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- drop_ins (one-night guests)
-- ---------------------------------------------------------------------------
create table public.drop_ins (
  id                   uuid        not null default gen_random_uuid(),
  tournament_id        uuid        not null,
  round_id             uuid,
  contact_id           uuid        not null,
  paid_by_contact_id   uuid,
  amount_cents         integer     not null,
  payment_status       text        not null default 'pending',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint drop_ins_pkey primary key (id),
  constraint drop_ins_tournament_id_fkey foreign key (tournament_id) references public.tournaments(id) on delete cascade,
  constraint drop_ins_round_id_fkey foreign key (round_id) references public.tournament_rounds(id) on delete set null,
  constraint drop_ins_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete restrict,
  constraint drop_ins_paid_by_contact_id_fkey foreign key (paid_by_contact_id) references public.contacts(id) on delete set null,
  constraint drop_ins_amount_cents_check check (amount_cents >= 0),
  constraint drop_ins_payment_status_check
    check (payment_status = any (array['pending','paid','waived','refunded']))
);
create trigger drop_ins_set_updated_at before update on public.drop_ins
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments (the Stripe ledger). No updated_at and no trigger in production —
-- reproduced faithfully, because a test that expected one would pass here and
-- fail there.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                         uuid        not null default gen_random_uuid(),
  created_at                 timestamptz not null default now(),
  registration_id            uuid,
  email                      text        not null,
  -- numeric(10,2), not bare numeric. Verified against production's
  -- information_schema on 2026-09-10: the scale is what rounds
  -- `amount_cents / 100.0` to cents and what makes an absurd amount raise
  -- 22003 instead of being stored. docs/core_schema_snapshot.sql renders this
  -- column as bare `numeric` with the precision only in a comment; a fixture
  -- copied from it literally would round differently from production.
  amount                     numeric(10,2) not null,
  currency                   text        not null default 'usd',
  tournament_name            text,
  stripe_session_id          text,
  stripe_payment_intent_id   text,
  status                     text        not null default 'pending',
  notes                      text,
  tournament_id              uuid,
  contact_id                 uuid,
  drop_in_id                 uuid,
  constraint payments_pkey primary key (id),
  constraint payments_stripe_session_id_key unique (stripe_session_id),
  constraint payments_registration_id_fkey foreign key (registration_id) references public.registrations(id) on delete set null,
  constraint payments_tournament_id_fkey foreign key (tournament_id) references public.tournaments(id) on delete set null,
  constraint payments_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null,
  constraint payments_drop_in_id_fkey foreign key (drop_in_id) references public.drop_ins(id) on delete set null,
  constraint payments_status_check
    check (status = any (array['pending','succeeded','failed','refunded']))
);
-- PARTIAL unique index: this is what makes a second Checkout Session sharing one
-- PaymentIntent raise 23505 rather than write a second ledger row.
create unique index payments_stripe_payment_intent_unique_idx on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index payments_registration_id_idx on public.payments (registration_id);

-- ---------------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key         text        not null,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  constraint site_settings_pkey primary key (key)
);
create trigger site_settings_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security, exactly as production has it: enabled everywhere, with
-- SELECT-only public policies on two tables and NO policies on the rest.
-- ---------------------------------------------------------------------------
alter table public.tournaments        enable row level security;
alter table public.contacts           enable row level security;
alter table public.teams              enable row level security;
alter table public.registrations      enable row level security;
alter table public.drop_ins           enable row level security;
alter table public.payments           enable row level security;
alter table public.site_settings      enable row level security;
alter table public.tournament_rounds  enable row level security;

create policy "Public read tournaments"   on public.tournaments   for select using (is_draft = false);
create policy "Public read site_settings" on public.site_settings for select using (true);

-- Production still carries the default table grants to anon/authenticated
-- (RLS is what actually blocks them). Reproduced so a test can prove that RLS,
-- not a missing grant, is the thing standing in the way.
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
