-- Allow cached Study reading aids and descriptive translations in Malay and Tamil.
-- Existing rows are untouched. App rollback can leave this additive constraint in place.
-- To narrow it later, first export and remove ms/ta cache rows; do not silently delete them.
alter table public.company_fact_translations
  drop constraint company_fact_translations_locale_check;
alter table public.company_fact_translations
  add constraint company_fact_translations_locale_check
  check (locale in ('en', 'zh', 'ms', 'ta'));
