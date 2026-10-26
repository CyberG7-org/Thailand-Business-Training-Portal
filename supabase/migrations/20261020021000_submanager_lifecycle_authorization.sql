-- Existing Owner FOR ALL and parent UPDATE policies are not Submanager lifecycle authority.
-- Only the trusted server's service-role client performs those mutations after Manager checks.
create function public.protect_submanager_lifecycle()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'submanager' then
      raise exception 'Submanager lifecycle requires the owning Manager service action';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'submanager' then
      raise exception 'Submanager lifecycle requires the owning Manager service action';
    end if;
    return old;
  end if;

  if old.role = 'submanager' or new.role = 'submanager' then
    -- Ordinary self-service language/password metadata changes remain possible. Role, parent,
    -- login, status, archive and every other profile field require the dedicated service path.
    if auth.uid() = old.id and
      (to_jsonb(new) - array['preferred_language', 'password_changed_at', 'updated_at']) =
      (to_jsonb(old) - array['preferred_language', 'password_changed_at', 'updated_at']) then
      return new;
    end if;
    raise exception 'Submanager lifecycle requires the owning Manager service action';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_submanager_lifecycle
  before insert or update or delete on public.profiles
  for each row execute function public.protect_submanager_lifecycle();
revoke all on function public.protect_submanager_lifecycle() from public, anon, authenticated;
