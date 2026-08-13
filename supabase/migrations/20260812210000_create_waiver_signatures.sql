-- In-app waiver signing — the placeholder that lets a player actually sign
-- while the PDF service is being sorted out.
--
-- Why this table exists at all, rather than another boolean:
-- docs/REBUILD-PLAN.md §2 records 104 registrations with a DocuSeal submission,
-- 97 marked signed, and `waiver_document_url` NULL for every single one — plus
-- 39 of 57 contact waivers that are `admin_override`, "a box ticked, not a
-- signed document". The site is carrying full legal exposure with zero legal
-- protection. Replacing one un-producible tick with another un-producible tick
-- would not move that number, so the placeholder captures what a court would
-- actually ask for: who typed their name, exactly when, from where, and against
-- which version of the waiver text.
--
-- This table is purely additive. Nothing that exists today selects it, so it
-- cannot break a live query the way a missing `is_draft` column would have.
-- Track B (B3/B4) repoints it at `roster_entries` alongside everything else.

create table if not exists public.waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  registration_id uuid references public.registrations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,

  waiver_type text not null check (waiver_type in ('adult', 'youth')),

  -- What the signer typed, kept verbatim. Compared against the name on the
  -- registration at sign time, but stored as-entered either way: what they
  -- actually wrote is the evidence, not our normalization of it.
  signed_name text not null,
  signed_at timestamptz not null default now(),

  -- For a youth waiver this is the parent/guardian; the player is the contact.
  signer_relationship text,

  -- Provenance. `inet` rather than text so a malformed value fails loudly.
  ip inet,
  user_agent text,

  -- Which wording they agreed to. Bump WAIVER_TEXT_VERSION in
  -- src/lib/waiver-text.ts whenever the text changes; old rows keep pointing at
  -- the wording that was on screen when they signed, which is the entire point
  -- of versioning it.
  waiver_version text not null
);

comment on table public.waiver_signatures is
  'One row per in-app waiver signature. The producible record behind contacts.waiver_signed_at when waiver_source = ''in_app''. Rendered for humans at /waiver/<id>.';

comment on column public.waiver_signatures.waiver_version is
  'Value of WAIVER_TEXT_VERSION (src/lib/waiver-text.ts) at sign time. Never backfill this — it would rewrite what the signer agreed to.';

create index if not exists waiver_signatures_registration_id_idx
  on public.waiver_signatures (registration_id);

create index if not exists waiver_signatures_contact_id_idx
  on public.waiver_signatures (contact_id);

-- The app reads and writes this table exclusively through `supabaseAdmin`
-- (service role, bypasses RLS). Enabling RLS with no policy therefore costs the
-- site nothing and makes the anon PostgREST endpoint return zero rows, which is
-- the correct answer for a table of signatures and IP addresses.
alter table public.waiver_signatures enable row level security;

-- `contacts.waiver_source` is CHECK-constrained to ('docuseal','admin_override',
-- 'import'). Promoting an in-app signature onto the contact writes 'in_app',
-- which the existing constraint rejects with a 23514 — so widen it here, in the
-- same migration that makes in-app signing possible. Without this the player
-- signs, the registration updates, and the contact promotion silently fails,
-- which is exactly the class of bug that left 104 waivers with no document.
alter table public.contacts
  drop constraint if exists contacts_waiver_source_check;

alter table public.contacts
  add constraint contacts_waiver_source_check
  check (
    waiver_source is null
    or waiver_source in ('docuseal', 'admin_override', 'import', 'in_app')
  );
