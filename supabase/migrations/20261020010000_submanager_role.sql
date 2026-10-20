-- A Submanager belongs to a Manager, but never receives is_staff permissions.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('learner', 'submanager', 'manager', 'admin'));

create or replace function public.enforce_team_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role = 'manager' and new.role <> 'manager'
     and exists (select 1 from public.profiles p where p.manager_id = new.id) then
    raise exception 'this manager still has team members; move or remove them first';
  end if;
  if new.role = 'submanager' and new.manager_id is null then
    raise exception 'a submanager must belong to a manager';
  end if;
  if new.manager_id is null then return new; end if;
  if new.role not in ('learner', 'submanager') then
    raise exception 'only learners and submanagers can belong to a team';
  end if;
  -- Lock the parent against a concurrent role change while the child is being attached.
  perform 1 from public.profiles p
    where p.id = new.manager_id and p.role = 'manager' for share;
  if not found then raise exception 'manager_id must reference a manager'; end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    id, login_id, role, manager_id, display_name, preferred_language, password_changed_at
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_id', new.id::text),
    coalesce(new.raw_app_meta_data ->> 'role', 'learner'),
    case when new.raw_app_meta_data ->> 'role' in ('submanager', 'learner')
      then nullif(new.raw_app_meta_data ->> 'manager_id', '')::uuid else null end,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'th'),
    new.created_at
  );
  return new;
end;
$$;

-- GoTrue can apply app metadata after auth.users INSERT: assign role AND parent atomically.
-- User-editable user_metadata is never a source of role or team authority.
create or replace function public.sync_profile_role_from_app_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('learner', 'submanager', 'manager', 'admin') and (
    v_role is distinct from (old.raw_app_meta_data ->> 'role') or
    (v_role = 'submanager' and (new.raw_app_meta_data ->> 'manager_id')
      is distinct from (old.raw_app_meta_data ->> 'manager_id'))
  ) then
    update public.profiles set role = v_role,
      manager_id = case
        when v_role = 'submanager' then nullif(new.raw_app_meta_data ->> 'manager_id', '')::uuid
        when v_role in ('manager', 'admin') then null
        else manager_id end
    where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.is_submanager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.profiles manager on manager.id = p.manager_id
    where p.id = auth.uid() and p.role = 'submanager' and p.status = 'active'
      and manager.role = 'manager' and manager.status = 'active'
  );
$$;

create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.role = 'manager' then p.id else p.manager_id end
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
    and (p.role <> 'submanager' or public.is_submanager());
$$;

comment on column public.profiles.manager_id is
  'The parent Manager for learners and Submanagers; required for Submanagers.';
revoke all on function public.enforce_team_membership() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_role_from_app_metadata() from public, anon, authenticated;
revoke all on function public.is_submanager() from public, anon, authenticated;
grant execute on function public.is_submanager() to authenticated, service_role;
-- Existing is_staff/is_manager and raw-data RLS remain unchanged.
