-- D85: a manager's code is `T-` + one letter and two digits (T-A12), as a learner's is the
-- team's code + two letters and two digits (D84). The app enforces the shape; this migration
-- moves the one team created before it: T-01 becomes T-A01, and its learners T-01-xxxx become
-- T-A01-xxxx.
--
-- A team is renamed whole — the manager and every learner under their code — in the profile,
-- the sign-in email and the login id in the user metadata together, so each person signs in with
-- the new code at once (as D69's rename did). Passwords, records, assignments and history stay:
-- they hang off the account's id, not its code. Old audit entries keep the old text as history.
-- A function rather than bare statements so the integration suite can prove the renamed accounts
-- really sign in; it is idempotent, as a code that is gone is not renamed again.

create or replace function public.rename_team_code(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text := lower(trim(p_from));
  v_to text := lower(trim(p_to));
  v_manager uuid;
  v_row record;
  v_new text;
  v_renamed integer := 0;
begin
  if v_to !~ '^t-[a-z][0-9]{2}$' then
    raise exception 'a team code is T- and one letter and two digits, not %', p_to;
  end if;

  select id into v_manager from public.profiles where login_id = v_from and role = 'manager';
  if v_manager is null then
    return 0; -- renamed already, or never there
  end if;

  -- Compared by prefix text rather than LIKE, so no character of a code acts as a wildcard.
  if exists (
    select 1 from public.profiles
     where login_id = v_to or left(login_id, length(v_to) + 1) = v_to || '-'
  ) then
    raise exception 'the code % is taken', p_to;
  end if;

  for v_row in
    select p.id, p.login_id
      from public.profiles p
     where p.id = v_manager
        or (p.manager_id = v_manager and left(p.login_id, length(v_from) + 1) = v_from || '-')
  loop
    v_new := v_to || substring(v_row.login_id from length(v_from) + 1);

    update auth.users u
       set email = v_new || '@' || split_part(u.email, '@', 2),
           raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('login_id', v_new),
           updated_at = now()
     where u.id = v_row.id;

    update auth.identities i
       set identity_data = i.identity_data || jsonb_build_object('email', u.email),
           updated_at = now()
      from auth.users u
     where u.id = v_row.id
       and i.user_id = u.id
       and i.provider = 'email';

    update public.profiles set login_id = v_new where id = v_row.id;
    v_renamed := v_renamed + 1;
  end loop;

  return v_renamed;
end;
$$;

revoke all on function public.rename_team_code(text, text) from public, anon, authenticated;
grant execute on function public.rename_team_code(text, text) to service_role;

select public.rename_team_code('t-01', 't-a01');
