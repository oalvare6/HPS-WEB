-- Link registrations to the canonical tournament and contact records.
-- Both columns are nullable for now so we can ship without breaking historical
-- rows; we will enforce NOT NULL after admin backfill in a later migration.
--
-- Also adds waiver_document_url which the DocuSeal webhook already writes to
-- but was missing from the original schema.

alter table public.registrations
  add column if not exists tournament_id uuid
    references public.tournaments(id) on delete set null;

alter table public.registrations
  add column if not exists contact_id uuid
    references public.contacts(id) on delete set null;

alter table public.registrations
  add column if not exists waiver_document_url text;

create index if not exists registrations_tournament_idx
  on public.registrations (tournament_id) where tournament_id is not null;

create index if not exists registrations_contact_idx
  on public.registrations (contact_id) where contact_id is not null;
