-- The manually localized v2 quiz may freeze Tamil or Malay answer text on new attempts.
-- Existing attempts and their frozen answer keys are unchanged.
alter table public.assessment_attempts drop constraint assessment_attempts_language_check;
alter table public.assessment_attempts add constraint assessment_attempts_language_check
  check (language in ('th', 'en', 'zh', 'ms', 'ta')) not valid;
alter table public.assessment_attempts validate constraint assessment_attempts_language_check;
