-- A code is spent only by an account that exists (spec §3.3). allocate_login_id moves the counter
-- before the auth service is asked for the account; when that call is refused, the app hands the
-- number back through this function. It is taken back only while it is still the latest one
-- issued — compared and updated in one statement — so a number allocated in between is never
-- crossed, and a number that ever belonged to an account is never reissued.

create or replace function public.release_login_id(p_scope text, p_value integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.login_id_counters
     set next_value = p_value
   where scope = p_scope
     and next_value = p_value + 1;
  return found;
end;
$$;

revoke all on function public.release_login_id(text, integer) from public, anon, authenticated;
grant execute on function public.release_login_id(text, integer) to service_role;
