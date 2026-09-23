-- P15a: the four questions every team-scoped policy asks (spec §6). Security definer so a policy
-- can call them without recursing into the policies on profiles.

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'manager' and p.status = 'active'
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin') and p.status = 'active'
  );
$$;

-- A manager team is themselves; a learner team is their manager; an admin has none.
create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.role = 'manager' then p.id else p.manager_id end
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function public.in_my_team(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
    where p.id = p_user
      and public.my_team() is not null
      and (p.id = public.my_team() or p.manager_id = public.my_team())
  );
$$;

revoke all on function public.is_manager() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.my_team() from public;
revoke all on function public.in_my_team(uuid) from public;
grant execute on function public.is_manager() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.my_team() to authenticated, service_role;
grant execute on function public.in_my_team(uuid) to authenticated, service_role;
