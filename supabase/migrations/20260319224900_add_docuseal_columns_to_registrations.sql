-- Add DocuSeal tracking columns to public.registrations.
--
-- This migration backfills the migrations history for columns originally
-- added via the loose `supabase/add-docuseal-columns.sql` script and applied
-- manually in the Supabase SQL Editor on 2026-03-19 (just after the
-- registrations table was first created). The timestamp sorts it before all
-- May 2026 migrations.
--
-- The DDL is idempotent (`add column if not exists`, `create index if not
-- exists`) so re-running it against the existing prod database is a no-op.
--
-- Rollback (do NOT run without explicit approval; this is destructive):
--   drop index if exists registrations_docuseal_submission_id_idx;
--   alter table public.registrations
--     drop column if exists docuseal_status,
--     drop column if exists docuseal_sign_url,
--     drop column if exists docuseal_submission_id;

alter table public.registrations
  add column if not exists docuseal_submission_id integer,
  add column if not exists docuseal_sign_url text,
  add column if not exists docuseal_status text not null default 'pending'
    check (docuseal_status in ('pending', 'sent', 'signed'));

create index if not exists registrations_docuseal_submission_id_idx
  on public.registrations (docuseal_submission_id);
