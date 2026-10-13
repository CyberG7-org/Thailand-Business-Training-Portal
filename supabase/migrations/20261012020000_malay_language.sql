-- Malay is supported on learner study, quiz and interview pages. The original three
-- languages remain required for author approval; Malay quiz text is frozen per attempt.
alter table public.profiles drop constraint profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('th', 'en', 'zh', 'ms'));

alter table public.study_material_localizations drop constraint study_material_localizations_language_check;
alter table public.study_material_localizations add constraint study_material_localizations_language_check
  check (language in ('th', 'en', 'zh', 'ms'));

alter table public.question_localizations drop constraint question_localizations_language_check;
alter table public.question_localizations add constraint question_localizations_language_check
  check (language in ('th', 'en', 'zh', 'ms'));

alter table public.assessment_attempts drop constraint assessment_attempts_language_check;
alter table public.assessment_attempts add constraint assessment_attempts_language_check
  check (language in ('th', 'en', 'zh', 'ms'));

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
  if p_lang not in ('th', 'en', 'zh', 'ms') then
    raise exception 'unsupported language: %', p_lang using errcode = 'check_violation';
  end if;
  update public.profiles set preferred_language = p_lang where id = auth.uid();
end;
$$;

revoke all on function public.set_my_preferred_language(text) from public;
grant execute on function public.set_my_preferred_language(text) to authenticated;
