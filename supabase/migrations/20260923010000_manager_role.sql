-- P15a: a third role between the admin and the learner (spec §3.1). `admin` and `learner` keep
-- their meaning, so every existing row and policy is unaffected.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('learner', 'manager', 'admin'));

-- The app-metadata sync trigger only recognised the two old values.
create or replace function public.sync_profile_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is distinct from (old.raw_app_meta_data ->> 'role')
     and v_role in ('learner', 'manager', 'admin') then
    update public.profiles set role = v_role where id = new.id;
  end if;
  return new;
end;
$$;
