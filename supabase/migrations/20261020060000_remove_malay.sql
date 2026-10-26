-- Malay is removed from the portal (owner decision, 2026-10-20). Remaining Malay data moves to
-- English or is deleted, then only Thai, English and Simplified Chinese are accepted. Reverses
-- 20261012020000_malay_language.sql and the 'ms' locale of 20261012015000.

-- Learners who chose Malay read the portal in English.
update public.profiles set preferred_language = 'en' where preferred_language = 'ms';

-- Old Malay quiz attempts are relabelled English; their frozen answer keys keep the English
-- (and Thai) wording the Malay text was translated from.
update public.assessment_attempts set language = 'en' where language = 'ms';
update public.assessment_answer_keys set localized = localized - 'ms' where localized ? 'ms';

-- Stored Malay translations. (Deleting a non-Thai question localization does not unapprove
-- its question.)
delete from public.study_material_localizations where language = 'ms';
delete from public.question_localizations where language = 'ms';
delete from public.company_fact_translations where locale = 'ms';

alter table public.profiles drop constraint profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('th', 'en', 'zh'));

alter table public.study_material_localizations drop constraint study_material_localizations_language_check;
alter table public.study_material_localizations add constraint study_material_localizations_language_check
  check (language in ('th', 'en', 'zh'));

alter table public.question_localizations drop constraint question_localizations_language_check;
alter table public.question_localizations add constraint question_localizations_language_check
  check (language in ('th', 'en', 'zh'));

alter table public.assessment_attempts drop constraint assessment_attempts_language_check;
alter table public.assessment_attempts add constraint assessment_attempts_language_check
  check (language in ('th', 'en', 'zh'));

alter table public.company_fact_translations drop constraint company_fact_translations_locale_check;
alter table public.company_fact_translations add constraint company_fact_translations_locale_check
  check (locale in ('en', 'zh'));

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
