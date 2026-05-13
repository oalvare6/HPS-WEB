-- Canonical person record. Every registration, drop-in, payment, and team
-- member ultimately points to a contact. Admin-managed only (no auth).
--
-- Identity:
--   * email is citext + UNIQUE -> case-insensitive dedupe
--   * phone is normalized to digits-only by the application layer; we keep
--     it as text and add a non-unique index for lookup.

create extension if not exists pgcrypto;
create extension if not exists citext;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contacts_email_unique_idx on public.contacts (email);
create index if not exists contacts_phone_idx on public.contacts (phone) where phone is not null;
create index if not exists contacts_tags_gin_idx on public.contacts using gin (tags);
create index if not exists contacts_last_first_idx on public.contacts (last_name, first_name);

create or replace function public.set_updated_at_contacts()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;

create trigger contacts_set_updated_at
before update on public.contacts
for each row
execute function public.set_updated_at_contacts();
