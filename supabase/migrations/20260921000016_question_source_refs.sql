-- P14b: AI-generated questions remember which reference passages grounded them (decision D43).
alter table public.questions
  add column source_refs jsonb not null default '[]'::jsonb;

comment on column public.questions.source_refs is
  'AI questions: [{document_id, document_name, document_type, page}] of the reference passages used; [] for hand-written questions.';
