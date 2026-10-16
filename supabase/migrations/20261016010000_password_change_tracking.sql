-- Track password changes separately from general profile/auth updates.
-- Existing accounts stay NULL: their historical password-change time is not known.
alter table public.profiles
  add column if not exists password_changed_at timestamptz;

-- New accounts start with the time their initial password was set.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, login_id, role, display_name, preferred_language, password_changed_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_id', new.id::text),
    coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role', 'learner'),
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'th'),
    new.created_at
  );
  return new;
end;
$$;

create or replace function public.record_password_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles
       set password_changed_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.record_password_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_password_changed on auth.users;
create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row execute function public.record_password_change();

-- Rollback: drop the trigger and function, then retain the nullable column to
-- preserve timestamps already recorded. Drop the column only if that history
-- has been explicitly exported or is no longer needed.
