-- Baseline: create public.registrations.
--
-- This migration backfills the migrations history for the registrations table,
-- which was originally created via the loose `supabase/registrations.sql`
-- script and applied manually in the Supabase SQL Editor on 2026-03-19. The
-- timestamp on this file is set to the original apply time so it sorts before
-- `20260513120600_alter_registrations_links.sql`, which alters this table.
--
-- The DDL is idempotent (`if not exists`) so re-running this against the
-- existing prod database is a no-op.
--
-- Rollback (do NOT run without explicit approval; this is destructive):
--   drop trigger if exists registrations_set_updated_at on public.registrations;
--   drop table if exists public.registrations;
--   -- public.set_updated_at() is shared with other triggers; do not drop it here.

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
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'partial', 'waived', 'refunded')),
  payment_method text,
  payment_amount numeric(10, 2),
  notes text
);

create unique index if not exists registrations_waiver_match_key_idx
  on public.registrations (waiver_match_key);

create index if not exists registrations_email_idx
  on public.registrations (email);

create index if not exists registrations_payment_status_idx
  on public.registrations (payment_status);

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
