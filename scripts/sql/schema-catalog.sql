-- ============================================================================
-- SCHEMA CATALOG — one JSON document describing the application schema.
-- ============================================================================
-- Stage 1.6. Run the same query against two databases and diff the results:
--
--   * production, read-only, from the SQL editor or the MCP execute_sql tool.
--     The 2026-09-10 capture is docs/production-schema-catalog-2026-09-10.json.
--   * a database built from an empty state by supabase/migrations/ alone
--     (scripts/test-migrations-from-empty.ts runs it and compares).
--
-- The catalog is structure only: no row data, no secrets, no PII. It covers
-- the `public` schema (tables, columns, constraints, indexes, policies,
-- triggers, functions, grants), the two Storage buckets and Storage policies,
-- and where citext/pgcrypto are installed.
--
-- Things deliberately NOT part of the comparison, because they cannot match
-- between a fresh build and a database that has been altered by hand for six
-- months, and because none of them changes what the application sees:
--   * column ORDER (attnum) — matches.kickoff_time/match_date are swapped in
--     production; PostgREST returns JSON, so the app never sees order;
--   * object OIDs, ownership, and function bodies' exact whitespace (bodies
--     are compared as an md5 of the whitespace-collapsed text: production's
--     claim_docuseal_webhook_event was pasted with CRLF line endings);
--   * schemas other than public/storage — production also carries
--     backup_2026_08_17, a hand-made copy of thirteen tables from the B1
--     cleanup, which is data, not schema;
--   * functions owned by extensions (citext installs ~60 of them).
--
-- SELECT-only. Safe to run anywhere.
-- ============================================================================

select jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'rls', c.relrowsecurity,
             'force_rls', c.relforcerowsecurity,
             'comment', obj_description(c.oid, 'pg_class')
           ) order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  ),
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'column', a.attname,
             'type', format_type(a.atttypid, a.atttypmod),
             'not_null', a.attnotnull,
             'default', pg_get_expr(d.adbin, d.adrelid),
             'identity', a.attidentity,
             'comment', col_description(c.oid, a.attnum)
           ) order by c.relname, a.attname), '[]'::jsonb)
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  ),
  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'name', k.conname,
             'type', k.contype,
             'definition', pg_get_constraintdef(k.oid)
           ) order by c.relname, k.conname), '[]'::jsonb)
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
     where k.connamespace = 'public'::regnamespace
  ),
  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', i.tablename,
             'name', i.indexname,
             'definition', i.indexdef,
             'comment', (select obj_description(c.oid, 'pg_class')
                           from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = i.schemaname and c.relname = i.indexname)
           ) order by i.tablename, i.indexname), '[]'::jsonb)
      from pg_indexes i
     where i.schemaname = 'public'
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'schema', schemaname,
             'table', tablename,
             'name', policyname,
             'permissive', permissive,
             'roles', roles::text[],
             'cmd', cmd,
             'qual', qual,
             'with_check', with_check
           ) order by schemaname, tablename, policyname), '[]'::jsonb)
      from pg_policies
     where schemaname in ('public', 'storage')
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', c.relname,
             'name', t.tgname,
             'definition', pg_get_triggerdef(t.oid)
           ) order by c.relname, t.tgname), '[]'::jsonb)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', p.proname,
             'args', pg_get_function_identity_arguments(p.oid),
             'returns', pg_get_function_result(p.oid),
             'language', l.lanname,
             'security_definer', p.prosecdef,
             'volatility', p.provolatile,
             'config', p.proconfig,
             'body_digest', md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))),
             'comment', obj_description(p.oid, 'pg_proc'),
             'grants', (
               select coalesce(jsonb_agg(jsonb_build_object('grantee', g.grantee, 'privilege', g.privilege_type)
                                         order by g.grantee, g.privilege_type), '[]'::jsonb)
                 from information_schema.routine_privileges g
                where g.specific_schema = 'public'
                  and g.specific_name = p.proname || '_' || p.oid::text
                  and g.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
             )
           ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
  ),
  'table_grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', g.table_name,
             'grantee', g.grantee,
             'privileges', g.privs
           ) order by g.table_name, g.grantee), '[]'::jsonb)
      from (
        select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
         group by table_name, grantee
      ) g
  ),
  'column_grants', (
    -- Only tables that carry column-level ACLs (today: match_scorers, whose
    -- contact_id is withheld from the browser keys). information_schema
    -- expands table-level grants into one row per column, which would bury
    -- the signal.
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', g.table_name,
             'column', g.column_name,
             'grantee', g.grantee,
             'privileges', g.privs
           ) order by g.table_name, g.column_name, g.grantee), '[]'::jsonb)
      from (
        select cp.table_name, cp.column_name, cp.grantee,
               string_agg(cp.privilege_type, ',' order by cp.privilege_type) as privs
          from information_schema.column_privileges cp
         where cp.table_schema = 'public'
           and cp.grantee in ('anon', 'authenticated', 'service_role')
           and cp.table_name in (
             select c.relname
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'
                and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and a.attacl is not null)
           )
         group by cp.table_name, cp.column_name, cp.grantee
      ) g
  ),
  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', e.extname, 'schema', n.nspname) order by e.extname), '[]'::jsonb)
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname in ('citext', 'pgcrypto')
  ),
  'buckets', (
    case when to_regclass('storage.buckets') is null then '[]'::jsonb
         else (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public) order by b.id), '[]'::jsonb)
                 from storage.buckets b)
    end
  )
) as catalog;
