-- =============================================================================
-- Enerlytics: initial schema for a NEW Supabase project
-- Migration: 20261126000000_initial_schema.sql
-- =============================================================================
-- Creates exactly what the current frontend uses. No new business modules.
--
--   public.user_profiles           (admin flag + display name, 1 row per auth user)
--   public.calculation_history     (Domestic / Commercial / Industrial results)
--   public.estimation_history      (Unified Estimator results)
--   public.recommendation_history  (Solar recommendation results)
--   public.tariff_settings         (admin-managed tariff records; not yet used
--                                   by the calculators)
--
-- Security model
--   * RLS is enabled on every table. The anon role gets NO table privileges.
--   * Users can read/insert/delete ONLY their own history rows. History rows
--     are immutable (no UPDATE).
--   * Users can read their own profile and may update ONLY full_name.
--     They cannot set is_admin. This is enforced TWICE:
--       1. column-level privileges: authenticated may UPDATE (full_name) only,
--          and has no INSERT privilege on user_profiles at all;
--       2. a trigger that rejects any change to is_admin made through the API
--          roles (anon / authenticated), even if privileges were later widened.
--   * Profiles are created by a SECURITY DEFINER trigger on auth.users, always
--     with is_admin = false. Signup metadata cannot set is_admin.
--   * Admin rights can only be granted from the SQL Editor (postgres role) or
--     with the service-role key on a server — never from the browser.
--   * tariff_settings: any signed-in user may read; only admins may write.
--
-- Safety
--   * Runs in a single transaction: if any statement fails, nothing is applied.
--   * Uses CREATE ... IF NOT EXISTS / CREATE OR REPLACE. It never drops a table
--     and never deletes data. "DROP POLICY/TRIGGER IF EXISTS" only removes the
--     policies/triggers that this same script (re)creates, so it can be re-run.
--   * Intended for a NEW, EMPTY project. If a table of the same name already
--     exists with a different structure, CREATE TABLE IF NOT EXISTS will skip
--     it and later statements may fail (and the whole script rolls back).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. user_profiles
-- -----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text        check (full_name is null or char_length(full_name) <= 200),
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.user_profiles is 'One row per auth user. is_admin can only be changed by the database owner / service role.';
comment on column public.user_profiles.is_admin is 'Platform administrator flag. Not writable through the API (column privileges + trigger).';

-- Helper used by RLS policies. SECURITY DEFINER so it can read user_profiles
-- without recursing through user_profiles' own RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.user_profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Guard: API roles can never set or change is_admin; also keeps id/created_at
-- immutable and maintains updated_at.
create or replace function public.protect_user_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.is_admin then
      raise exception 'is_admin cannot be set through the API' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin cannot be changed through the API' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.id         := old.id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.protect_user_profile() from public, anon, authenticated;

drop trigger if exists protect_user_profile on public.user_profiles;
create trigger protect_user_profile
  before insert or update on public.user_profiles
  for each row execute function public.protect_user_profile();

-- Create a profile automatically for every new auth user (always non-admin).
-- Only full_name is taken from signup metadata; anything else is ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, is_admin)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 200), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that signed up before this script ran.
insert into public.user_profiles (id, full_name, is_admin)
select u.id,
       nullif(left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 200), ''),
       false
from auth.users u
on conflict (id) do nothing;

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
  on public.user_profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles"
  on public.user_profiles for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT or DELETE policy: profiles are created by the trigger above and
-- removed by ON DELETE CASCADE when the auth user is deleted.
revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;
grant update (full_name) on public.user_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. History tables (same shape; differ only in the *_type column)
--    inputs/results must be JSON objects and are capped at 64 KB each to
--    protect free-tier storage from oversized or abusive payloads.
-- -----------------------------------------------------------------------------
create table if not exists public.calculation_history (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  calculation_type  text        not null check (calculation_type in ('domestic', 'commercial', 'industrial')),
  inputs            jsonb       not null default '{}'::jsonb,
  results           jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint calculation_history_inputs_object  check (jsonb_typeof(inputs)  = 'object' and octet_length(inputs::text)  <= 65536),
  constraint calculation_history_results_object check (jsonb_typeof(results) = 'object' and octet_length(results::text) <= 65536)
);

create table if not exists public.estimation_history (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  estimation_type   text        not null check (estimation_type in ('payback', 'costbenefit', 'breakeven', 'roi', 'unified')),
  inputs            jsonb       not null default '{}'::jsonb,
  results           jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint estimation_history_inputs_object  check (jsonb_typeof(inputs)  = 'object' and octet_length(inputs::text)  <= 65536),
  constraint estimation_history_results_object check (jsonb_typeof(results) = 'object' and octet_length(results::text) <= 65536)
);

create table if not exists public.recommendation_history (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  recommendation_type  text        not null check (recommendation_type in ('solar')),
  inputs               jsonb       not null default '{}'::jsonb,
  results              jsonb       not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  constraint recommendation_history_inputs_object  check (jsonb_typeof(inputs)  = 'object' and octet_length(inputs::text)  <= 65536),
  constraint recommendation_history_results_object check (jsonb_typeof(results) = 'object' and octet_length(results::text) <= 65536)
);

-- Supports the History page query: WHERE user_id = ? ORDER BY created_at DESC
create index if not exists calculation_history_user_created_idx    on public.calculation_history    (user_id, created_at desc);
create index if not exists estimation_history_user_created_idx     on public.estimation_history     (user_id, created_at desc);
create index if not exists recommendation_history_user_created_idx on public.recommendation_history (user_id, created_at desc);

alter table public.calculation_history    enable row level security;
alter table public.estimation_history     enable row level security;
alter table public.recommendation_history enable row level security;

-- calculation_history
drop policy if exists "Users can view their own calculations" on public.calculation_history;
create policy "Users can view their own calculations"
  on public.calculation_history for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own calculations" on public.calculation_history;
create policy "Users can add their own calculations"
  on public.calculation_history for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own calculations" on public.calculation_history;
create policy "Users can delete their own calculations"
  on public.calculation_history for delete to authenticated
  using (user_id = (select auth.uid()));

-- estimation_history
drop policy if exists "Users can view their own estimations" on public.estimation_history;
create policy "Users can view their own estimations"
  on public.estimation_history for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own estimations" on public.estimation_history;
create policy "Users can add their own estimations"
  on public.estimation_history for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own estimations" on public.estimation_history;
create policy "Users can delete their own estimations"
  on public.estimation_history for delete to authenticated
  using (user_id = (select auth.uid()));

-- recommendation_history
drop policy if exists "Users can view their own recommendations" on public.recommendation_history;
create policy "Users can view their own recommendations"
  on public.recommendation_history for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own recommendations" on public.recommendation_history;
create policy "Users can add their own recommendations"
  on public.recommendation_history for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own recommendations" on public.recommendation_history;
create policy "Users can delete their own recommendations"
  on public.recommendation_history for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.calculation_history, public.estimation_history, public.recommendation_history from anon, authenticated;
grant select, insert, delete on public.calculation_history, public.estimation_history, public.recommendation_history to authenticated;

-- -----------------------------------------------------------------------------
-- 3. tariff_settings (read: any signed-in user; write: admins only)
-- -----------------------------------------------------------------------------
create table if not exists public.tariff_settings (
  id           uuid        primary key default gen_random_uuid(),
  tariff_type  text        not null check (tariff_type in ('domestic', 'commercial', 'industrial')),
  tariff_data  jsonb       not null default '{}'::jsonb check (jsonb_typeof(tariff_data) = 'object'),
  updated_by   uuid        default auth.uid() references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists tariff_settings_type_updated_idx on public.tariff_settings (tariff_type, updated_at desc);

-- Server-side stamping so clients cannot forge who/when.
create or replace function public.stamp_tariff_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke all on function public.stamp_tariff_settings() from public, anon, authenticated;

drop trigger if exists stamp_tariff_settings on public.tariff_settings;
create trigger stamp_tariff_settings
  before insert or update on public.tariff_settings
  for each row execute function public.stamp_tariff_settings();

alter table public.tariff_settings enable row level security;

drop policy if exists "Signed-in users can view tariffs" on public.tariff_settings;
create policy "Signed-in users can view tariffs"
  on public.tariff_settings for select to authenticated
  using (true);

drop policy if exists "Admins can add tariffs" on public.tariff_settings;
create policy "Admins can add tariffs"
  on public.tariff_settings for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update tariffs" on public.tariff_settings;
create policy "Admins can update tariffs"
  on public.tariff_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete tariffs" on public.tariff_settings;
create policy "Admins can delete tariffs"
  on public.tariff_settings for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.tariff_settings from anon, authenticated;
grant select, insert, update, delete on public.tariff_settings to authenticated;

commit;
