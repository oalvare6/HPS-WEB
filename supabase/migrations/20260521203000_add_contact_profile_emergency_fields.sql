-- Phase 6: store emergency contact on the canonical contact so player-edited
-- profile data persists across registrations. Until now, emergency contact
-- lived only on `registrations` (and was re-collected on every signup).
--
-- Additive only. No backfill. New columns are nullable text.
--
-- Rollback:
--   alter table public.contacts
--     drop column if exists emergency_phone,
--     drop column if exists emergency_name;

alter table public.contacts
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text;
