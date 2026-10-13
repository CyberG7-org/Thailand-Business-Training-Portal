-- Descriptive translations are supplemental to immutable Thai training snapshots.
-- They are generated once per source-text hash and are never used for scoring or legal facts.
create table public.company_fact_translations (
  training_version_id uuid not null references public.company_training_versions(id) on delete cascade,
  locale text not null check (locale in ('en', 'zh', 'ms')),
  source_hash text not null,
  translations jsonb not null,
  created_at timestamptz not null default now(),
  primary key (training_version_id, locale, source_hash)
);

alter table public.company_fact_translations enable row level security;
-- No client policy: only the server's service role may read or write these company answers.
