-- ============================================================================
-- Houston Premier Soccer — CORE SCHEMA SNAPSHOT (production, read-only)
-- ============================================================================
-- Captured 2026-09-09 via read-only introspection of the production project
-- (information_schema.columns, pg_constraint, pg_indexes, pg_policies,
-- pg_trigger, pg_get_functiondef) — PostgreSQL 17.6.
--
-- THIS FILE IS DOCUMENTATION. It is NOT a migration and must never be placed
-- in supabase/migrations/ or applied anywhere. It records what production
-- actually looks like for the objects involved in registration, payment,
-- roster and waiver state, so that the forward migrations written for F-01 /
-- F-02 target the real structure rather than the repository's idea of it.
--
-- Contains no data and no secrets. Column order is production ordinal order.
-- Scope: registrations, payments, tournaments (events), contacts, teams,
-- drop_ins, waiver_signatures, site_settings + the constraints, indexes,
-- policies, triggers and functions that touch them. Match/round tables are
-- out of scope for this remediation and are omitted.
--
-- SUPERSEDED FOR COMPARISONS 2026-09-10 (Stage 1.6): the whole-schema,
-- machine-readable capture is docs/production-schema-catalog-2026-09-10.json
-- (produced by scripts/sql/schema-catalog.sql) and is what
-- scripts/test-migrations-from-empty.ts diffs a fresh build against. This
-- file stays as the human-readable description of the eight core tables. The
-- migration ledger listed at the bottom is unchanged as of 2026-09-10.
--
-- CORRECTED 2026-09-10 (Stage 1.4): `payments.amount`,
-- `registrations.payment_amount` and `tournaments.entry_fee` were rendered as
-- bare `numeric` with the precision only in a trailing comment. Production has
-- `numeric(10,2)` for all three (re-verified against information_schema). The
-- difference is not cosmetic — the scale is what rounds `amount_cents / 100.0`
-- to cents, and the precision is what makes an absurd amount raise 22003
-- instead of being stored. A test fixture copied from the old text behaved
-- differently from production. See docs/STAGE-1-4-STRIPE-VALIDATION.md §4.5.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tournaments  (the "events" table; defined in repo only by loose file
--               supabase/tournaments.sql + later migrations)
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
create index tournaments_display_order_start_date_idx on public.tournaments (display_order, start_date);
create index tournaments_is_featured_idx on public.tournaments (display_order, start_date) where is_featured = true;
create index tournaments_status_idx on public.tournaments (status);

-- ---------------------------------------------------------------------------
-- contacts  (canonical person; email is the identity today)
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
create index contacts_last_first_idx on public.contacts (last_name, first_name);
create index contacts_phone_idx on public.contacts (phone) where phone is not null;
create index contacts_tags_gin_idx on public.contacts using gin (tags);
create index contacts_waiver_expires_idx on public.contacts (waiver_expires_at desc) where waiver_expires_at is not null;

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
create index teams_tournament_idx on public.teams (tournament_id);
create index teams_captain_idx on public.teams (captain_contact_id) where captain_contact_id is not null;
create unique index teams_tournament_name_unique_idx on public.teams (tournament_id, lower(name));

-- ---------------------------------------------------------------------------
-- registrations  (the roster: one live row per person per event)
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
  -- NOTE: production still permits the legacy values 'team' and 'freeagent'
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
create unique index registrations_one_live_spot_idx on public.registrations (tournament_id, contact_id)
  where cancelled_at is null and contact_id is not null;
create index registrations_active_idx on public.registrations (tournament_id, contact_id) where cancelled_at is null;
create index registrations_contact_idx on public.registrations (contact_id) where contact_id is not null;
create index registrations_docuseal_submission_id_idx on public.registrations (docuseal_submission_id);
create index registrations_email_idx on public.registrations (email);
create index registrations_email_tournament_idx on public.registrations (email, tournament_id) where email is not null;
create index registrations_needs_admin_review_idx on public.registrations (needs_admin_review) where needs_admin_review = true;
create index registrations_payment_status_idx on public.registrations (payment_status);
create index registrations_team_idx on public.registrations (team_id) where team_id is not null;
create index registrations_tournament_contact_status_idx on public.registrations (tournament_id, contact_id, payment_status);
create index registrations_tournament_idx on public.registrations (tournament_id) where tournament_id is not null;

-- ---------------------------------------------------------------------------
-- drop_ins  (one-night guests; 0 rows in production, still wired in code)
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
create index drop_ins_contact_idx on public.drop_ins (contact_id);
create index drop_ins_paid_by_idx on public.drop_ins (paid_by_contact_id) where paid_by_contact_id is not null;
create index drop_ins_payment_status_idx on public.drop_ins (payment_status);
create index drop_ins_round_idx on public.drop_ins (round_id) where round_id is not null;
create index drop_ins_tournament_idx on public.drop_ins (tournament_id, created_at desc);

-- ---------------------------------------------------------------------------
-- payments  (the Stripe ledger; defined in repo only by loose file
--            supabase/payments.sql + 20260513120700_alter_payments_links)
-- ---------------------------------------------------------------------------
create table public.payments (
  id                         uuid        not null default gen_random_uuid(),
  created_at                 timestamptz not null default now(),
  registration_id            uuid,
  email                      text        not null,
  amount                     numeric(10,2) not null,        -- dollars
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
create unique index payments_stripe_payment_intent_unique_idx on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index payments_contact_idx on public.payments (contact_id) where contact_id is not null;
create index payments_drop_in_idx on public.payments (drop_in_id) where drop_in_id is not null;
create index payments_email_idx on public.payments (email);
create index payments_registration_id_idx on public.payments (registration_id);
create index payments_tournament_idx on public.payments (tournament_id) where tournament_id is not null;
-- Observed: every production payment row has status='succeeded', currency='usd',
-- a 'cs_' stripe_session_id and a stripe_payment_intent_id (60/60).
-- NO Stripe event id column exists; NO updated_at; NO trigger.

-- ---------------------------------------------------------------------------
-- waiver_signatures  (in-app signing evidence; 0 rows in production)
-- ---------------------------------------------------------------------------
create table public.waiver_signatures (
  id                   uuid        not null default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  registration_id      uuid,
  contact_id           uuid,
  waiver_type          text        not null,
  signed_name          text        not null,
  signed_at            timestamptz not null default now(),
  signer_relationship  text,
  ip                   inet,
  user_agent           text,
  waiver_version       text        not null,
  constraint waiver_signatures_pkey primary key (id),
  constraint waiver_signatures_registration_id_fkey foreign key (registration_id) references public.registrations(id) on delete cascade,
  constraint waiver_signatures_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null,
  constraint waiver_signatures_waiver_type_check check (waiver_type = any (array['adult','youth']))
);
create index waiver_signatures_contact_id_idx on public.waiver_signatures (contact_id);
create index waiver_signatures_registration_id_idx on public.waiver_signatures (registration_id);

-- ---------------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key         text        not null,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  constraint site_settings_pkey primary key (key)
);

-- ---------------------------------------------------------------------------
-- Row Level Security (all tables above: enabled, not forced)
-- ---------------------------------------------------------------------------
alter table public.tournaments        enable row level security;
alter table public.contacts           enable row level security;
alter table public.teams              enable row level security;
alter table public.registrations      enable row level security;
alter table public.drop_ins           enable row level security;
alter table public.payments           enable row level security;
alter table public.waiver_signatures  enable row level security;
alter table public.site_settings      enable row level security;
-- Policies that exist (all PERMISSIVE, role {public}, SELECT only):
create policy "Public read tournaments"   on public.tournaments   for select using (is_draft = false);
create policy "Public read site_settings" on public.site_settings for select using (true);
-- contacts, teams, registrations, drop_ins, payments, waiver_signatures:
--   RLS enabled and ZERO policies -> anon/authenticated are denied; the app
--   reaches them only through the service role. (Default table GRANTs to
--   anon/authenticated still exist — 14 per table — but RLS blocks every row.)
-- No INSERT/UPDATE/DELETE policy exists on any table.

-- ---------------------------------------------------------------------------
-- Triggers (all BEFORE UPDATE, updated_at setters)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger tournaments_set_updated_at   before update on public.tournaments   for each row execute function public.set_updated_at();
create trigger registrations_set_updated_at before update on public.registrations for each row execute function public.set_updated_at();
-- Per-table clones with identical bodies:
--   set_updated_at_contacts (contacts), set_updated_at_teams (teams),
--   set_updated_at_drop_ins (drop_ins), set_updated_at_site_settings (site_settings).
-- payments and waiver_signatures have NO trigger.

-- ---------------------------------------------------------------------------
-- Functions/RPCs in the payment / roster / waiver workflows
-- ---------------------------------------------------------------------------
-- open_play_attendees(p_event_id uuid) returns table(first_name text, last_initial text, joined_at timestamptz)
--   language sql, STABLE, SECURITY INVOKER, set search_path = public.
--   Reads live registrations of an open_play event (cancelled_at is null),
--   truncating last names in SQL. Executable by service_role only.
--
-- save_match_result(...) / clear_match_result(...)  — plpgsql, SECURITY INVOKER,
--   service_role only. Match-result transaction; not part of F-01/F-02 and
--   not reproduced here (see supabase/migrations/20260908120000_*.sql, whose
--   body matches production verbatim).
--
-- There is NO database function for: recording a payment, confirming a
-- registration, issuing or consuming a resume/magic-link token, or rate
-- limiting. Those exist only as multi-statement application code in
-- src/lib/stripe-payments.ts and src/lib/pay-eligibility.ts as of the audit.

-- ---------------------------------------------------------------------------
-- Migration ledger (supabase_migrations.schema_migrations) — 22 rows
-- ---------------------------------------------------------------------------
-- 20260319215600 create_registrations
-- 20260319224900 add_docuseal_columns_to_registrations
-- 20260513120000 create_tournament_rounds
-- 20260513120100 enable_citext
-- 20260513120200 create_contacts
-- 20260513120300 create_teams
-- 20260513120400 create_drop_ins
-- 20260513120500 alter_tournaments_pricing
-- 20260513120600 alter_registrations_links
-- 20260513120700 alter_payments_links
-- 20260513120800 backfill_contacts
-- 20260513120900 backfill_tournament_links
-- 20260513121000 rls_policies
-- 20260619201109 create_matches_and_scorers          (file: 20260619140000)
-- 20260812170137 add_tournaments_is_draft            (file: 20260812190000)
-- 20260813000824 create_waiver_signatures            (file: 20260812210000)
-- 20260814174433 add_tournaments_kind                (file: 20260814230000)
-- 20260814184245 add_registrations_cancelled_at      (file: 20260814234500)
-- 20260814185600 dedupe_registrations_and_guard      (file: 20260815001500)
-- 20260814211133 add_open_play_free_entry_config     (file: 20260815030000)
-- 20260814211247 open_play_attendance_and_free_entry (file: 20260815031000)
-- 20260909004333 round_counts_and_scorer_identity    (file: 20260908120000)
-- Not in the ledger although their objects exist in production:
--   20260513121100, 20260513121200, 20260521124500, 20260521150000,
--   20260521170000, 20260521203000, 20260603120000, 20260908120100
-- ============================================================================
