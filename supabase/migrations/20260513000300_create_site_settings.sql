-- Baseline: create public.site_settings.
--
-- Stage 1.6 (2026-09-10, docs/STAGE-1-6-MIGRATION-RECONCILIATION.md). Backfills
-- the migration history for the loose script `supabase/site-settings.sql` (now
-- archived under docs/archive/loose-sql/), applied by hand and never as a
-- migration. Two later migrations depend on the table existing:
-- `20260513121000_rls_policies.sql` enables RLS and adds the public read
-- policy, and `20260603120000_pay_email_lookup_indexes.sql` inserts the
-- community WhatsApp URL. Sorted with the other 2026-05-13 baselines, before
-- the first of those dependents.
--
-- Site-wide editable strings/JSON exposed via /admin/site. The loose script
-- carried the RLS policy as a commented-out suggestion; the real one lives in
-- 20260513121000_rls_policies.sql and is not repeated here.
--
-- Idempotent: safe to re-run against production (no-op apart from recreating
-- the same trigger). Names match production: site_settings_pkey,
-- set_updated_at_site_settings(), site_settings_set_updated_at.
--
-- Rollback (do NOT run without explicit approval):
--   drop trigger if exists site_settings_set_updated_at on public.site_settings;
--   drop function if exists public.set_updated_at_site_settings();
--   drop table if exists public.site_settings;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_site_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;

create trigger site_settings_set_updated_at
before update on public.site_settings
for each row
execute function public.set_updated_at_site_settings();
