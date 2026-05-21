-- Canonical waiver state on contacts.
-- This supports one-year waiver reuse across registrations while keeping
-- per-registration waiver rows for audit/history.

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

create index if not exists contacts_waiver_expires_idx
  on public.contacts (waiver_expires_at desc)
  where waiver_expires_at is not null;
