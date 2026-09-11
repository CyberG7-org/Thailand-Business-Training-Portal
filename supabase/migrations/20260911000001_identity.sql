-- Identity: profiles mirror auth.users with the portal-specific fields.
-- Accounts are created only through the admin API (enable_signup = false).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique,
  role text not null check (role in ('learner', 'admin')),
  display_name text,
  preferred_language text not null default 'th' check (preferred_language in ('th', 'en', 'zh')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per portal account. role drives authorization; login_id is what admins hand to learners.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer so RLS policies can call it without recursing into profiles' own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- Create the profile row when the admin API creates an auth user.
-- login_id/display_name/preferred_language come from user_metadata. The role is taken from
-- app_metadata (not user-editable) when present; GoTrue applies custom app_metadata in a
-- follow-up update after the insert, so the sync trigger below is what normally sets it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, login_id, role, display_name, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_id', new.id::text),
    coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role', 'learner'),
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'th')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.role in sync with app_metadata.role (set by the admin API on create/update).
create or replace function public.sync_profile_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is distinct from (old.raw_app_meta_data ->> 'role') and v_role in ('learner', 'admin') then
    update public.profiles set role = v_role where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_role_from_app_metadata();

alter table public.profiles enable row level security;

create policy "profiles: users read their own row"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: admins do everything"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
