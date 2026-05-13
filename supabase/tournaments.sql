create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  status text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'completed', 'cancelled')),
  registration_open boolean not null default false,
  payments_open boolean not null default false,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  time_start text,
  time_end text,
  recurrence text,
  location text,
  format text,
  entry_fee numeric(10, 2),
  max_teams integer,
  image_url text,
  image_preset text,
  register_url text,
  pay_url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_display_order_start_date_idx
  on public.tournaments (display_order asc, start_date asc);

create index if not exists tournaments_status_idx
  on public.tournaments (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_set_updated_at on public.tournaments;

create trigger tournaments_set_updated_at
before update on public.tournaments
for each row
execute function public.set_updated_at();

-- Seed: matches current hardcoded "Spring Classic 2026" content
insert into public.tournaments (
  title, slug, status, registration_open, payments_open,
  description, start_date, time_start, time_end, recurrence,
  location, format, register_url, pay_url, image_preset, display_order
) values (
  'Spring Classic 2026',
  'spring-classic-2026',
  'upcoming',
  true,
  true,
  '8 rounds of Friday night soccer, 7–10 PM. Adult 7v7 league — Spring 2026.',
  '2026-03-27T19:00:00-05:00',
  '7:00 PM',
  '10:00 PM',
  'Every Friday starting Mar 27, 2026',
  '14062 Ambrose St, Houston TX',
  'Adult 7v7',
  '/register',
  '/pay',
  'field-night',
  0
)
on conflict (slug) do nothing;
