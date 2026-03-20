-- Add DocuSeal columns to registrations table
-- Run in Supabase SQL Editor

alter table public.registrations
  add column if not exists docuseal_submission_id integer,
  add column if not exists docuseal_sign_url text,
  add column if not exists docuseal_status text not null default 'pending'
    check (docuseal_status in ('pending', 'sent', 'signed'));

create index if not exists registrations_docuseal_submission_id_idx
  on public.registrations (docuseal_submission_id);
