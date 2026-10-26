-- Archive identity rather than deleting history or freeing its login ID.
alter table public.profiles add column archived_at timestamptz;
alter table public.profiles add constraint archived_profiles_disabled
  check (archived_at is null or status = 'disabled');
comment on column public.profiles.archived_at is
  'Removed Submanager identity, retained permanently for creator/history references and login reservation.';

-- Existing Manager profile UPDATE policies must not allow clearing an archive via REST.
create function public.preserve_archived_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.archived_at is not null and (
    new.archived_at is distinct from old.archived_at or new.status <> 'disabled'
  ) then
    raise exception 'archived accounts cannot be reactivated';
  end if;
  return new;
end;
$$;
create trigger profiles_preserve_archive before update on public.profiles
  for each row execute function public.preserve_archived_profile();
revoke all on function public.preserve_archived_profile() from public, anon, authenticated;
