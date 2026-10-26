-- A Submanager may assign only records they created, so the creator must not be rewritable
-- from a signed-in session (a Manager's FOR ALL policy covers the row). The service role and
-- migrations carry no end-user role.
create or replace function public.dbd_created_by_is_fixed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'a record creator cannot be changed';
  end if;
  return new;
end;
$$;

create trigger dbd_records_created_by_fixed
  before update of created_by on public.dbd_records
  for each row execute function public.dbd_created_by_is_fixed();
