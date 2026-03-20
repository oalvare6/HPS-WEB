-- Run once in Supabase SQL Editor if your table still allows team/freeagent.
-- 1) Map old types to adult
update public.registrations
set registration_type = 'adult'
where registration_type in ('team', 'freeagent');

-- 2) Replace the check constraint (name may differ; find it under Table → registrations → Constraints)
alter table public.registrations
  drop constraint if exists registrations_registration_type_check;

alter table public.registrations
  add constraint registrations_registration_type_check
  check (registration_type in ('adult', 'youth'));
