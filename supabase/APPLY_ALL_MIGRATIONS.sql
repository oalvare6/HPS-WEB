-- =============================================================================
-- HPS-WEB master overhaul migration bundle
-- =============================================================================
-- Paste this whole file into:  Supabase Dashboard → SQL → New query → Run
--
-- Idempotent: safe to re-run. Every statement uses IF [NOT] EXISTS, ON CONFLICT,
-- or replace-friendly DDL.
--
-- Sections (run in order, but the file already runs them in order):
--   1. Extensions
--   2. tournament_rounds (recovers if not yet applied)
--   3. contacts
--   4. teams + team_members
--   5. drop_ins
--   6. tournaments pricing columns
--   7. registrations FK columns
--   8. payments FK columns
--   9. Backfill contacts from registrations + payments
--  10. Backfill tournament_id where unambiguous
--  11. Row-Level Security policies
--  12. Drop legacy league_round_overrides
--  13. Waiver bucket RLS hygiene
-- =============================================================================


-- 1. EXTENSIONS ---------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists citext;


-- 2. tournament_rounds --------------------------------------------------------
create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  round_date date,
  time_start text,
  time_end text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'rescheduled', 'note')),
  note text,
  rescheduled_to date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_rounds_tournament_idx
  on public.tournament_rounds (tournament_id, sort_order asc, round_date asc);

create or replace function public.set_updated_at_tournament_rounds()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists tournament_rounds_set_updated_at on public.tournament_rounds;
create trigger tournament_rounds_set_updated_at
before update on public.tournament_rounds
for each row execute function public.set_updated_at_tournament_rounds();


-- 3. contacts -----------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email citext not null,
  phone text,
  dob date,
  notes text,
  tags text[] not null default '{}',
  marketing_opt_in boolean not null default true,
  waiver_type text check (waiver_type is null or waiver_type in ('adult', 'youth')),
  waiver_signed_at timestamptz,
  waiver_expires_at timestamptz,
  waiver_document_url text,
  waiver_submission_id integer,
  waiver_source text
    check (waiver_source is null or waiver_source in ('docuseal', 'admin_override', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  add column if not exists waiver_type text
    check (waiver_type is null or waiver_type in ('adult', 'youth'));

alter table public.contacts
  add column if not exists waiver_signed_at timestamptz;

alter table public.contacts
  add column if not exists waiver_expires_at timestamptz;

alter table public.contacts
  add column if not exists waiver_document_url text;

alter table public.contacts
  add column if not exists waiver_submission_id integer;

alter table public.contacts
  add column if not exists waiver_source text
    check (
      waiver_source is null
      or waiver_source in ('docuseal', 'admin_override', 'import')
    );

create unique index if not exists contacts_email_unique_idx on public.contacts (email);
create index if not exists contacts_phone_idx on public.contacts (phone) where phone is not null;
create index if not exists contacts_tags_gin_idx on public.contacts using gin (tags);
create index if not exists contacts_last_first_idx on public.contacts (last_name, first_name);
create index if not exists contacts_waiver_expires_idx
  on public.contacts (waiver_expires_at desc)
  where waiver_expires_at is not null;

create or replace function public.set_updated_at_contacts()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at_contacts();


-- 4. teams + team_members -----------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  captain_contact_id uuid references public.contacts(id) on delete set null,
  color text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teams_tournament_name_unique_idx
  on public.teams (tournament_id, lower(name));
create index if not exists teams_tournament_idx on public.teams (tournament_id);
create index if not exists teams_captain_idx on public.teams (captain_contact_id) where captain_contact_id is not null;

create or replace function public.set_updated_at_teams()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at_teams();

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'player'
    check (role in ('player', 'captain', 'sub')),
  notes text,
  joined_at timestamptz not null default now(),
  primary key (team_id, contact_id)
);

create index if not exists team_members_contact_idx on public.team_members (contact_id);


-- 5. drop_ins -----------------------------------------------------------------
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
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists drop_ins_set_updated_at on public.drop_ins;
create trigger drop_ins_set_updated_at
before update on public.drop_ins
for each row execute function public.set_updated_at_drop_ins();


-- 6. tournaments pricing columns ---------------------------------------------
alter table public.tournaments
  add column if not exists entry_fee_cents integer
    check (entry_fee_cents is null or entry_fee_cents >= 0);

alter table public.tournaments
  add column if not exists drop_in_fee_cents integer not null default 2000
    check (drop_in_fee_cents >= 0);

alter table public.tournaments
  add column if not exists stripe_product_id text;

alter table public.tournaments
  add column if not exists stripe_price_id text;

update public.tournaments
   set entry_fee_cents = round(entry_fee * 100)::integer
 where entry_fee is not null
   and entry_fee_cents is null;


-- 7. registrations FK columns -------------------------------------------------
alter table public.registrations
  add column if not exists tournament_id uuid
    references public.tournaments(id) on delete set null;

alter table public.registrations
  add column if not exists contact_id uuid
    references public.contacts(id) on delete set null;

alter table public.registrations
  add column if not exists waiver_document_url text;

create index if not exists registrations_tournament_idx
  on public.registrations (tournament_id) where tournament_id is not null;

create index if not exists registrations_contact_idx
  on public.registrations (contact_id) where contact_id is not null;


-- 8. payments FK columns ------------------------------------------------------
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


-- 9. Backfill contacts from registrations + payments --------------------------
with ranked as (
  select
    r.id,
    lower(r.email) as email_lc,
    r.first_name,
    r.last_name,
    r.phone,
    r.dob,
    row_number() over (
      partition by lower(r.email)
      order by r.created_at desc
    ) as rn
  from public.registrations r
  where r.email is not null and r.email <> ''
)
insert into public.contacts (first_name, last_name, email, phone, dob, tags, marketing_opt_in)
select
  coalesce(nullif(trim(first_name), ''), 'Unknown'),
  coalesce(nullif(trim(last_name), ''), ''),
  email_lc::citext,
  phone,
  dob,
  array['backfilled', 'from-registration'],
  true
from ranked
where rn = 1
on conflict (email) do nothing;

insert into public.contacts (first_name, last_name, email, tags, marketing_opt_in)
select distinct
  split_part(p.email, '@', 1),
  '',
  lower(p.email)::citext,
  array['backfilled', 'from-payment'],
  true
from public.payments p
where p.email is not null and p.email <> ''
  and not exists (
    select 1 from public.contacts c where c.email = lower(p.email)::citext
  )
on conflict (email) do nothing;

update public.registrations r
   set contact_id = c.id
  from public.contacts c
 where r.contact_id is null
   and r.email is not null
   and c.email = lower(r.email)::citext;

update public.payments p
   set contact_id = c.id
  from public.contacts c
 where p.contact_id is null
   and p.email is not null
   and c.email = lower(p.email)::citext;


-- 10. Backfill tournament_id where unambiguous --------------------------------
do $$
declare
  total_tournaments int;
  the_only_tournament_id uuid;
begin
  select count(*) into total_tournaments from public.tournaments;

  if total_tournaments = 1 then
    select id into the_only_tournament_id from public.tournaments limit 1;

    update public.registrations
       set tournament_id = the_only_tournament_id
     where tournament_id is null;

    update public.payments
       set tournament_id = the_only_tournament_id
     where tournament_id is null;
  end if;
end$$;

update public.payments p
   set tournament_id = t.id
  from public.tournaments t
 where p.tournament_id is null
   and p.tournament_name is not null
   and lower(t.title) = lower(p.tournament_name);


-- 11. Row-Level Security policies --------------------------------------------
alter table public.tournaments enable row level security;
drop policy if exists "Public read tournaments" on public.tournaments;
create policy "Public read tournaments"
  on public.tournaments for select using (true);

alter table public.tournament_rounds enable row level security;
drop policy if exists "Public read tournament_rounds" on public.tournament_rounds;
create policy "Public read tournament_rounds"
  on public.tournament_rounds for select using (true);

alter table public.tournament_updates enable row level security;
drop policy if exists "Public read tournament_updates" on public.tournament_updates;
create policy "Public read tournament_updates"
  on public.tournament_updates for select using (true);

alter table public.site_settings enable row level security;
drop policy if exists "Public read site_settings" on public.site_settings;
create policy "Public read site_settings"
  on public.site_settings for select using (true);

alter table public.contacts enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.drop_ins enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;


-- 12. Drop legacy league_round_overrides --------------------------------------
drop trigger if exists league_round_overrides_set_updated_at on public.league_round_overrides;
drop table if exists public.league_round_overrides;
drop function if exists public.set_updated_at_round_overrides();


-- 13. Waiver bucket RLS hygiene -----------------------------------------------
-- (Skipped here. storage.objects is owned by `supabase_admin` and the SQL
-- Editor user can't ALTER it. Supabase already enables RLS on storage.objects
-- by default, and we never created a public read policy on the
-- waiver-signatures bucket. If you ever need to add bucket policies, use the
-- Storage → Policies UI in the Supabase Dashboard instead.)


-- =============================================================================
-- DONE.
-- =============================================================================
-- After this runs successfully, verify with:
--   select count(*) from public.contacts;
--   select id, title, entry_fee_cents, drop_in_fee_cents from public.tournaments;
--   select count(*) filter (where tournament_id is null) as orphaned_registrations
--     from public.registrations;
-- =============================================================================
