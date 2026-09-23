-- P15a: the two columns that anchor a team (spec §3.2). Everything else reaches its team
-- through a join to one of these.

-- People: which team a learner belongs to. Null for managers and admins.
alter table public.profiles add column manager_id uuid references public.profiles (id);
create index profiles_manager_idx on public.profiles (manager_id);
comment on column public.profiles.manager_id is
  'The manager whose team this learner belongs to; null for managers and admins.';

-- Companies: which team a record belongs to. Null means it belongs to the admin.
alter table public.dbd_records add column team_id uuid references public.profiles (id);
create index dbd_records_team_idx on public.dbd_records (team_id);
comment on column public.dbd_records.team_id is
  'The manager whose team uploaded this record; null when an admin created it.';

-- Invariants 1 and 2 of the spec: only a learner has a team, and that team is a manager.
create or replace function public.enforce_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Parent side: a manager who still holds learners cannot stop being one, or their team
  -- would point at an account that is no longer a manager.
  if tg_op = 'UPDATE' and old.role = 'manager' and new.role <> 'manager'
     and exists (select 1 from public.profiles p where p.manager_id = new.id) then
    raise exception 'this manager still has learners; move or remove them first';
  end if;
  if new.manager_id is null then
    return new;
  end if;
  if new.role <> 'learner' then
    raise exception 'only a learner can belong to a team (role is %)', new.role;
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = new.manager_id and p.role = 'manager'
  ) then
    raise exception 'manager_id must reference a manager';
  end if;
  return new;
end;
$$;

create trigger profiles_team_membership
  before insert or update of manager_id, role on public.profiles
  for each row execute function public.enforce_team_membership();

-- Supabase grants EXECUTE to anon and authenticated by default (migration 0012): a trigger
-- function is nobody's to call directly.
revoke all on function public.enforce_team_membership() from public, anon, authenticated;
