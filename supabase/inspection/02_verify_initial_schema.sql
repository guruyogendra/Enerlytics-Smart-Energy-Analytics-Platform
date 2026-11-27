-- READ-ONLY checks to run AFTER 20261126000000_initial_schema.sql has been applied.
-- Run in Supabase Dashboard -> SQL Editor. Nothing here modifies the database.

-- V1. Every table exists and has RLS enabled (expect 5 rows, rls_enabled = true)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('user_profiles', 'calculation_history', 'estimation_history',
                    'recommendation_history', 'tariff_settings')
order by 1;

-- V2. Policies (expect 16: user_profiles 3, each history table 3, tariff_settings 4)
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- V3. The anon role has no table privileges (expect 0 rows)
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';

-- V4. Signed-in users may only UPDATE full_name on user_profiles (expect 1 row: full_name)
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'user_profiles'
  and grantee = 'authenticated' and privilege_type in ('UPDATE', 'INSERT');

-- V5. Triggers in place (expect on_auth_user_created, protect_user_profile, stamp_tariff_settings)
select c.relnamespace::regnamespace as schema, c.relname as table_name, t.tgname as trigger_name
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgname in ('on_auth_user_created', 'protect_user_profile', 'stamp_tariff_settings')
order by 3;

-- V6. Every auth user has a profile (expect missing_profiles = 0)
select (select count(*) from auth.users) as auth_users,
       (select count(*) from public.user_profiles) as profiles,
       (select count(*) from auth.users u
         where not exists (select 1 from public.user_profiles p where p.id = u.id)) as missing_profiles;
