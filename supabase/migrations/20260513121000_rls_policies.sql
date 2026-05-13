-- Row-Level Security policies.
--
-- All public `tournaments*` tables are read-only to anyone (used by the
-- public site). Every other table is locked down — only the service role
-- (used by `supabaseAdmin` in API routes) can read or write them, because
-- there is no user auth in this app and writes always go through admin
-- API handlers.
--
-- Service role bypasses RLS entirely, so we don't have to write any
-- service_role policies; we just enable RLS and add the public read rules.

-- ----- public READ policies --------------------------------------------

alter table public.tournaments enable row level security;
drop policy if exists "Public read tournaments" on public.tournaments;
create policy "Public read tournaments"
  on public.tournaments
  for select
  using (true);

alter table public.tournament_rounds enable row level security;
drop policy if exists "Public read tournament_rounds" on public.tournament_rounds;
create policy "Public read tournament_rounds"
  on public.tournament_rounds
  for select
  using (true);

alter table public.tournament_updates enable row level security;
drop policy if exists "Public read tournament_updates" on public.tournament_updates;
create policy "Public read tournament_updates"
  on public.tournament_updates
  for select
  using (true);

alter table public.site_settings enable row level security;
drop policy if exists "Public read site_settings" on public.site_settings;
create policy "Public read site_settings"
  on public.site_settings
  for select
  using (true);

-- ----- locked-down tables (admin only) ---------------------------------
-- Enabling RLS without a policy denies all access to the anon role. The
-- service role bypasses RLS, which is exactly what the admin API uses.

alter table public.contacts enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.drop_ins enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
