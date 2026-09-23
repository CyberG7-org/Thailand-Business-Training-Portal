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

-- A policy that joins to another table re-enters that table's policies, and dbd_records reads
-- user_dbd_assignments to let a learner see their own company — so a policy that joins the two
-- deadlocks Postgres with "infinite recursion detected in policy". These ask the same questions
-- from inside a definer function, which runs as the owner and so evaluates no policies at all.
create or replace function public.record_in_my_team(p_record uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dbd_records r
    where r.id = p_record and r.team_id = public.my_team()
  );
$$;

create or replace function public.document_in_my_team(p_document uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dbd_documents d
    join public.dbd_records r on r.id = d.record_id
    where d.id = p_document and r.team_id = public.my_team()
  );
$$;

-- in_my_team() also answers yes for the caller themselves; this one means "one of my learners".
create or replace function public.learner_of_my_team(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.manager_id = public.my_team()
  );
$$;

-- Storage keys are text. A key whose first segment is not a uuid must miss, not raise: one
-- stray object would otherwise break the whole bucket listing.
create or replace function public.key_record_is_my_team(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dbd_records r
    where r.id::text = split_part(p_key, '/', 1) and r.team_id = public.my_team()
  );
$$;

create or replace function public.key_learner_is_my_team(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id::text = split_part(p_key, '/', 1) and p.manager_id = public.my_team()
  );
$$;

create or replace function public.key_session_is_my_team(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.call_sessions cs
    join public.profiles p on p.id = cs.user_id
    where cs.id::text = split_part(p_key, '/', 1) and p.manager_id = public.my_team()
  );
$$;

-- `revoke ... from public` alone leaves Supabase's default grants to anon and authenticated
-- standing, which is the regression migration 0012 exists to prevent.
revoke all on function public.is_manager() from public, anon, authenticated;
revoke all on function public.is_staff() from public, anon, authenticated;
revoke all on function public.my_team() from public, anon, authenticated;
revoke all on function public.in_my_team(uuid) from public, anon, authenticated;
revoke all on function public.record_in_my_team(uuid) from public, anon, authenticated;
revoke all on function public.document_in_my_team(uuid) from public, anon, authenticated;
revoke all on function public.learner_of_my_team(uuid) from public, anon, authenticated;
revoke all on function public.key_record_is_my_team(text) from public, anon, authenticated;
revoke all on function public.key_learner_is_my_team(text) from public, anon, authenticated;
revoke all on function public.key_session_is_my_team(text) from public, anon, authenticated;
grant execute on function public.is_manager() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.my_team() to authenticated, service_role;
grant execute on function public.in_my_team(uuid) to authenticated, service_role;
grant execute on function public.record_in_my_team(uuid) to authenticated, service_role;
grant execute on function public.document_in_my_team(uuid) to authenticated, service_role;
grant execute on function public.learner_of_my_team(uuid) to authenticated, service_role;
grant execute on function public.key_record_is_my_team(text) to authenticated, service_role;
grant execute on function public.key_learner_is_my_team(text) to authenticated, service_role;
grant execute on function public.key_session_is_my_team(text) to authenticated, service_role;
