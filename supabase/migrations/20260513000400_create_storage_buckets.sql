-- Baseline: the two Storage buckets and the one Storage policy the site uses.
--
-- Stage 1.6 (2026-09-10, docs/STAGE-1-6-MIGRATION-RECONCILIATION.md). Backfills
-- the migration history for the loose scripts `supabase/storage-bucket.sql`
-- (waiver-signatures, created in production 2026-03-20) and
-- `supabase/tournament-images-bucket.sql` (tournament-images plus its public
-- read policy, created 2026-05-13 00:14 UTC), both now archived under
-- docs/archive/loose-sql/. The admin banner upload
-- (src/app/api/admin/tournaments/upload/route.ts) writes to `tournament-images`
-- and hands out its public URL, so a Preview branch without the bucket cannot
-- upload an event image. `waiver-signatures` is not referenced by the
-- application any more; it is kept because production has it (2 objects).
--
-- Guarded, because this file has to run in three places:
--   * a Supabase project or Preview branch, where the `storage` schema exists
--     and the migration runs as `postgres` (creates the buckets and policy);
--   * production, where all three already exist (no-op);
--   * a plain PostgreSQL used by scripts/test-migrations-from-empty.ts, where
--     there is no `storage` schema at all (skipped with a NOTICE).
-- Statements that name storage tables are executed dynamically so nothing is
-- even parsed when the schema is absent.
--
-- The policy is created only if a policy of that name is not already on
-- storage.objects, rather than drop-and-recreate: on production a drop, however
-- brief, would take public image reads offline for that instant, for nothing.
-- If the migration role may not create policies on storage.objects, the
-- buckets still get created and the policy is reported as a NOTICE for the
-- operator to add through Storage -> Policies in the dashboard.
--
-- Rollback (do NOT run without explicit approval; deleting a bucket with
-- objects in it is destructive and the dashboard is the safer place for it):
--   drop policy if exists "Public read tournament images" on storage.objects;
--   delete from storage.buckets where id in ('waiver-signatures', 'tournament-images');

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets is not present (plain PostgreSQL); skipping bucket creation';
    return;
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('waiver-signatures', 'waiver-signatures', false)
    on conflict (id) do nothing
  $sql$;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('tournament-images', 'tournament-images', true)
    on conflict (id) do nothing
  $sql$;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Public read tournament images'
  ) then
    return;
  end if;

  execute $sql$
    create policy "Public read tournament images"
      on storage.objects for select
      using (bucket_id = 'tournament-images')
  $sql$;
exception
  when insufficient_privilege then
    raise notice 'could not create policy "Public read tournament images" on storage.objects (%); add it in the dashboard under Storage -> Policies', sqlerrm;
end
$$;
