-- Learners have no update policy on profiles (role/status must stay admin-only), so the
-- language preference is changed through a narrow security-definer function instead.
create or replace function public.set_my_preferred_language(p_lang text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_lang not in ('th', 'en', 'zh') then
    raise exception 'unsupported language: %', p_lang using errcode = 'check_violation';
  end if;
  update public.profiles set preferred_language = p_lang where id = auth.uid();
end;
$$;

revoke all on function public.set_my_preferred_language(text) from public;
grant execute on function public.set_my_preferred_language(text) to authenticated;
