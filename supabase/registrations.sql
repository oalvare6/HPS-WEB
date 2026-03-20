create extension if not exists pgcrypto;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  registration_type text not null check (registration_type in ('adult', 'youth')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  dob date not null,
  emergency_name text not null,
  emergency_phone text not null,
  team_name text,
  waiver_type text not null check (waiver_type in ('adult', 'youth')),
  waiver_signed boolean not null default false,
  waiver_signed_at timestamptz,
  waiver_submission_id text,
  waiver_match_key uuid not null default gen_random_uuid(),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'partial', 'waived', 'refunded')),
  payment_method text,
  payment_amount numeric(10, 2),
  notes text,
  docuseal_submission_id integer,
  docuseal_sign_url text,
  docuseal_status text not null default 'pending' check (docuseal_status in ('pending', 'sent', 'signed'))
);

create unique index if not exists registrations_waiver_match_key_idx
  on public.registrations (waiver_match_key);

create index if not exists registrations_email_idx
  on public.registrations (email);

create index if not exists registrations_payment_status_idx
  on public.registrations (payment_status);

create index if not exists registrations_docuseal_submission_id_idx
  on public.registrations (docuseal_submission_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists registrations_set_updated_at on public.registrations;

create trigger registrations_set_updated_at
before update on public.registrations
for each row
execute function public.set_updated_at();
