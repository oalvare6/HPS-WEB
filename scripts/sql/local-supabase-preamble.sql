-- ============================================================================
-- LOCAL SUPABASE PREAMBLE — what an EMPTY Supabase database already contains
-- before the first migration runs, reproduced on a plain PostgreSQL.
-- ============================================================================
-- Stage 1.6. `scripts/test-migrations-from-empty.ts` applies this file to a
-- freshly created database and then applies every file in
-- supabase/migrations/ in order, exactly as a Supabase Preview branch does.
-- The migrations assume the platform has already provided a few things; a
-- bare `createdb` provides none of them, and the chain would fail for reasons
-- that have nothing to do with the migrations:
--
--   * the roles `anon`, `authenticated`, `service_role` and `authenticator`
--     (every GRANT/REVOKE in the migrations names them);
--   * the `extensions` schema holding `pgcrypto`, so that
--     `create extension if not exists pgcrypto` is the same no-op it is on
--     Supabase (where the extension is pre-installed there, not in public);
--   * the default privileges Supabase configures for objects the `postgres`
--     role creates in `public` — ALL on tables, sequences and functions to
--     anon/authenticated/service_role. Production's grants come from these
--     defaults, and the catalog comparison checks them, so they must exist
--     here too or every table would show a grant difference;
--   * the `postgres` role's search_path ("$user", public, extensions).
--
-- What is deliberately a STUB: the `storage` schema. Supabase Storage owns it
-- and the real tables are wider than this. Only the columns the bucket
-- migration touches are declared, so that
-- 20260513000400_create_storage_buckets.sql exercises its real code path
-- (insert buckets, create the read policy) instead of skipping. The real
-- schema is exercised on the Supabase Preview branch, not here.
--
-- What is deliberately absent: `auth`, `realtime`, `vault`, `graphql`. No
-- migration references them.
--
-- This is a TEST FIXTURE. It must never be placed in supabase/migrations/ or
-- applied to any hosted project.
--
-- Role attributes and per-role settings were verified against production's
-- pg_roles on 2026-09-10 (same values as scripts/sql/local-core-schema.sql).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end
$$;

alter role anon           set statement_timeout = '3s';
alter role authenticated  set statement_timeout = '8s';
alter role authenticator  set statement_timeout = '8s';
alter role authenticator  set lock_timeout = '8s';
grant anon, authenticated, service_role to authenticator;

-- The migrations run as `postgres` on Supabase. This cluster's superuser is
-- also called postgres (scripts/_pg.ts initdb -U postgres), so the same
-- search_path applies.
alter role postgres set search_path = "$user", public, extensions;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

-- Supabase's default privileges for objects created by `postgres` in public.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage — STUB (see header). Real Supabase Storage owns this schema.
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id          text        primary key,
  name        text        not null,
  public      boolean     not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid        primary key default gen_random_uuid(),
  bucket_id   text        references storage.buckets(id),
  name        text,
  created_at  timestamptz not null default now()
);

alter table storage.objects enable row level security;
