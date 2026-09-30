-- D69: account codes are typed, not counted. The owner gives a manager `T-` + 2–6 letters or
-- digits (T-G4); a manager gives a learner their own code + `-` + 2–6 letters or digits
-- (T-G4-L8). The app checks a code is free before creating it, and the auth service's unique
-- email settles two creations racing for one code.
--
-- 1. The accounts numbered under D53 take the new shape: t01 → t-01, t01-01 → t-01-01 — the
--    profile, the sign-in email and the login id in the user metadata together, so each person
--    signs in with the new code at once. Old audit entries keep the old text as history.
--    A function rather than bare statements so the integration suite can prove the renamed
--    accounts really sign in; it is idempotent, as the new shape never matches the old one.

create or replace function public.rename_legacy_login_ids()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renamed integer;
begin
  -- Auth first, while the profiles still carry the old codes that pick the rows out.
  update auth.users u
     set email = l.new_id || '@' || split_part(u.email, '@', 2),
         raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('login_id', l.new_id),
         updated_at = now()
    from (
      select p.id, 't-' || substring(p.login_id from 2) as new_id
        from public.profiles p
       where p.role in ('manager', 'learner')
         and p.login_id ~ '^t[0-9]+(-[0-9]+)?$'
    ) l
   where u.id = l.id;

  update auth.identities i
     set identity_data = i.identity_data || jsonb_build_object('email', u.email),
         updated_at = now()
    from auth.users u
    join public.profiles p on p.id = u.id
   where i.user_id = u.id
     and i.provider = 'email'
     and p.role in ('manager', 'learner')
     and p.login_id ~ '^t[0-9]+(-[0-9]+)?$';

  update public.profiles p
     set login_id = 't-' || substring(p.login_id from 2)
   where p.role in ('manager', 'learner')
     and p.login_id ~ '^t[0-9]+(-[0-9]+)?$';
  get diagnostics v_renamed = row_count;
  return v_renamed;
end;
$$;

revoke all on function public.rename_legacy_login_ids() from public, anon, authenticated;
grant execute on function public.rename_legacy_login_ids() to service_role;

select public.rename_legacy_login_ids();

-- 2. Nothing is counted any more.
drop function public.release_login_id(text, integer);
drop function public.allocate_login_id(text, text);
drop table public.login_id_counters;

-- 3. A code is chosen once, at creation, by the server that composes its prefix. A manager's
--    own session may update their learners' rows (display name, status), and without this it
--    could also rewrite a learner's code — under another team's prefix, or onto a code the
--    sign-in email does not match. The service role and migrations carry no end-user role.
create or replace function public.login_id_is_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.login_id is distinct from old.login_id
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'a login id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_login_id_fixed
  before update of login_id on public.profiles
  for each row execute function public.login_id_is_fixed();

revoke all on function public.login_id_is_fixed() from public, anon, authenticated;
