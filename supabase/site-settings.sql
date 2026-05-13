-- Site-wide editable strings/JSON exposed via /admin/site
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

-- Optional public read RLS (uncomment and run if you switch public reads off the service role)
-- alter table public.site_settings enable row level security;
-- drop policy if exists "Public read site settings" on public.site_settings;
-- create policy "Public read site settings"
--   on public.site_settings for select
--   using (true);
