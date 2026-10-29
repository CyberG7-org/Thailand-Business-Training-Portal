-- Website language preference only. Quiz/assessment and authored-question languages
-- remain th/en/zh until their content is separately approved.
-- Existing profile values are preserved; no rows are rewritten.
alter table public.profiles drop constraint profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('th', 'en', 'zh', 'ta', 'ms')) not valid;
alter table public.profiles validate constraint profiles_preferred_language_check;

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
  if p_lang not in ('th', 'en', 'zh', 'ta', 'ms') then
    raise exception 'unsupported language: %', p_lang using errcode = 'check_violation';
  end if;
  update public.profiles set preferred_language = p_lang where id = auth.uid();
end;
$$;

revoke all on function public.set_my_preferred_language(text) from public;
grant execute on function public.set_my_preferred_language(text) to authenticated;
