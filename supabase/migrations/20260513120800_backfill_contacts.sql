-- Backfill the new contacts table from existing registrations + payments.
-- Idempotent: uses ON CONFLICT on the unique email index and only updates
-- registrations.contact_id / payments.contact_id when they are still NULL.
--
-- Strategy:
--   1) Insert one contact per distinct lower(email) found anywhere, using
--      the most recently created registration row for that email as the
--      best available name/phone/dob source.
--   2) Insert any extra contacts for emails that exist only in payments
--      (these rows will have minimal info — name = email until admin edits).
--   3) Link registrations.contact_id and payments.contact_id by email.

-- 1) Seed from registrations (best source of profile data).
with ranked as (
  select
    r.id,
    lower(r.email) as email_lc,
    r.first_name,
    r.last_name,
    r.phone,
    r.dob,
    row_number() over (
      partition by lower(r.email)
      order by r.created_at desc
    ) as rn
  from public.registrations r
  where r.email is not null and r.email <> ''
)
insert into public.contacts (first_name, last_name, email, phone, dob, tags, marketing_opt_in)
select
  coalesce(nullif(trim(first_name), ''), 'Unknown'),
  coalesce(nullif(trim(last_name), ''), ''),
  email_lc::citext,
  phone,
  dob,
  array['backfilled', 'from-registration'],
  true
from ranked
where rn = 1
on conflict (email) do nothing;

-- 2) Seed from payments for emails not yet in contacts.
insert into public.contacts (first_name, last_name, email, tags, marketing_opt_in)
select distinct
  split_part(p.email, '@', 1),
  '',
  lower(p.email)::citext,
  array['backfilled', 'from-payment'],
  true
from public.payments p
where p.email is not null and p.email <> ''
  and not exists (
    select 1 from public.contacts c where c.email = lower(p.email)::citext
  )
on conflict (email) do nothing;

-- 3a) Link registrations.contact_id by email.
update public.registrations r
   set contact_id = c.id
  from public.contacts c
 where r.contact_id is null
   and r.email is not null
   and c.email = lower(r.email)::citext;

-- 3b) Link payments.contact_id by email.
update public.payments p
   set contact_id = c.id
  from public.contacts c
 where p.contact_id is null
   and p.email is not null
   and c.email = lower(p.email)::citext;
