-- Support tournament pay email lookup: contact by email, then registration
-- for (contact_id, tournament_id) with waiver/payment state.
--
-- No new tables. WhatsApp uses existing site_settings key footer.whatsapp_url.
-- Waiver policy (app layer): one valid contact waiver (adult OR youth, 365 days)
-- counts for any tournament; adult/youth chosen at pay gate step 2.
--
-- Rollback:
--   drop index if exists public.registrations_tournament_contact_status_idx;
--   drop index if exists public.registrations_email_tournament_idx;

-- Fast path: contact_id + tournament_id + payment_status (pay resume / lookup)
create index if not exists registrations_tournament_contact_status_idx
  on public.registrations (tournament_id, contact_id, payment_status);

-- Fallback: registrations.email exists from legacy rows (citext index may exist)
create index if not exists registrations_email_tournament_idx
  on public.registrations (email, tournament_id)
  where email is not null;

-- Ensure community WhatsApp URL exists (editable in /admin/site)
insert into public.site_settings (key, value)
values (
  'footer.whatsapp_url',
  '"https://chat.whatsapp.com/HzBW39TgVemIA6EHWMnInY"'::jsonb
)
on conflict (key) do nothing;
