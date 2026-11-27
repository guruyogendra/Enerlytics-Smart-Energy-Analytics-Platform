-- =============================================================================
-- Enerlytics: READ-ONLY inspection of the existing Supabase database
-- =============================================================================
-- Purpose:
--   Collect the current tables, columns, constraints, indexes, Row Level
--   Security (RLS) settings, policies, triggers, functions and grants before
--   any migration is written.
--
-- Safety:
--   * Every query below is a plain SELECT on catalog/metadata views.
--     Nothing creates, alters, inserts, updates or deletes anything.
--   * No query returns email addresses, names, passwords or tokens.
--     Q2 returns row COUNTS only; Q14 returns counts of admins only;
--     Q15 returns the contents of tariff_settings (rate data, no personal data).
--
-- How to run (Supabase Dashboard → SQL Editor):
--   1. Open https://supabase.com/dashboard → your project → "SQL Editor".
--   2. Click "+ New query" and paste ONE query at a time (from "-- Q1" down to
--      the line before the next "-- Q"), or paste the whole file and use
--      "Run selected" on each highlighted query. The editor only shows the
--      result of the LAST statement when several run at once.
--   3. Click "Run" (or Ctrl+Enter).
--   4. Export each result with the "Export → Copy as CSV/Markdown" (or
--      "Download CSV") option and send it back, labelled with its Q-number.
--   If a query errors (e.g. "relation does not exist"), send the error text —
--   that is useful information too.
-- =============================================================================


-- Q1. Tables in public/storage, with RLS status ------------------------------
select n.nspname                as schema,
       c.relname                as table_name,
       c.relrowsecurity         as rls_enabled,
       c.relforcerowsecurity    as rls_forced,
       pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in ('public', 'storage')
order by 1, 2;


-- Q2. Exact row counts for every public table (counts only, no data) ---------
select table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint as row_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;


-- Q3. Columns -----------------------------------------------------------------
select table_name,
       ordinal_position as pos,
       column_name,
       data_type,
       udt_name,
       is_nullable,
       column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;


-- Q4. Constraints (primary keys, foreign keys, unique, check) -----------------
select conrelid::regclass as table_name,
       conname            as constraint_name,
       case contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
                    when 'u' then 'UNIQUE' when 'c' then 'CHECK'
                    when 'x' then 'EXCLUDE' else contype::text end as type,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by 1, 3, 2;


-- Q5. Indexes -----------------------------------------------------------------
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- Q6. RLS policies (public tables and storage buckets) ------------------------
select schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual       as using_expression,
       with_check as with_check_expression
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;


-- Q7. Triggers on public, auth and storage tables -----------------------------
--     (e.g. a trigger on auth.users that creates user_profiles rows)
select n.nspname  as schema,
       c.relname  as table_name,
       t.tgname   as trigger_name,
       t.tgenabled as enabled,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname in ('public', 'auth', 'storage')
order by 1, 2, 3;


-- Q8. Functions defined in public (excluding extension-owned functions) -------
--     Please skim the definitions before sharing in case anyone pasted a
--     secret into a function body (unlikely, but worth checking).
select p.proname                               as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef                             as security_definer,
       l.lanname                               as language,
       pg_get_functiondef(p.oid)               as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l  on l.oid = p.prolang
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1;


-- Q9. Table privileges granted to the API roles -------------------------------
select table_name,
       grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;


-- Q10. Admin-escalation check: policies + column grants on user_profiles ------
--      Answers: "can a normal signed-in user set is_admin = true on themselves?"
select 'policy' as kind, policyname as name, cmd as detail,
       coalesce(qual, '') || ' | WITH CHECK: ' || coalesce(with_check, '') as expression
from pg_policies
where schemaname = 'public' and tablename = 'user_profiles'
union all
select 'column_grant', grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'user_profiles'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('UPDATE', 'INSERT')
order by 1, 2, 3;


-- Q11. Views in public --------------------------------------------------------
select table_name as view_name, view_definition
from information_schema.views
where table_schema = 'public'
order by 1;


-- Q12. Custom enum types in public --------------------------------------------
select t.typname as enum_name,
       string_agg(e.enumlabel, ', ' order by e.enumsortorder) as labels
from pg_type t
join pg_enum e      on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by 1;


-- Q13. Storage buckets and installed extensions --------------------------------
select 'bucket' as kind, id as name, public::text as detail,
       coalesce(file_size_limit::text, '') as extra
from storage.buckets
union all
select 'extension', extname, extversion, ''
from pg_extension
order by 1, 2;


-- Q14. Admin summary (counts only, no identities) ------------------------------
--      Errors if user_profiles or is_admin does not exist — send the error.
select count(*)                          as total_profiles,
       count(*) filter (where is_admin)  as admin_profiles,
       (select count(*) from auth.users) as total_auth_users
from public.user_profiles;


-- Q15. Current tariff_settings contents (rate data only) -----------------------
--      updated_by (a user UUID) is deliberately omitted.
select id, tariff_type, tariff_data, updated_at
from public.tariff_settings
order by tariff_type, updated_at desc;
