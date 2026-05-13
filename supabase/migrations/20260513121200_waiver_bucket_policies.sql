-- Storage RLS for the waiver-signatures bucket.
--
-- Intentionally a no-op when run via the Supabase SQL Editor: the
-- storage.objects table is owned by the `supabase_admin` role, so any
-- ALTER / DROP POLICY statement run as the SQL Editor user fails with
-- "must be owner of table objects".
--
-- The good news: Supabase already enables RLS on storage.objects by
-- default, and we never created a public read policy on the
-- waiver-signatures bucket. So nothing has to change here.
--
-- If you ever need to expose waiver objects (e.g. signed URLs for an
-- admin app), do it through the Supabase Dashboard:
--   Storage  →  Policies  →  waiver-signatures  →  New policy
-- rather than running ALTER TABLE statements from here.

-- (Intentional no-op.)
select 1;
