-- Phase 5: flag registrations that need admin review for ambiguous contact links.
--
-- When POST /api/register (or the backfill script) finds more than one distinct
-- contact matching the registration's email or phone, the registration is
-- linked to the email-canonical contact (most stable identity) and this flag
-- is set so an admin can decide whether to merge the duplicate contacts.
--
-- Additive only. Default false so existing rows are unaffected.
--
-- Rollback:
--   drop index if exists public.registrations_needs_admin_review_idx;
--   alter table public.registrations drop column if exists needs_admin_review;

alter table public.registrations
  add column if not exists needs_admin_review boolean not null default false;

create index if not exists registrations_needs_admin_review_idx
  on public.registrations (needs_admin_review)
  where needs_admin_review = true;
