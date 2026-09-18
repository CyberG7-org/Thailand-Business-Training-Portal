-- P11: AI question authoring. A batch groups the drafts one generation run produced so admins
-- can review them together; questions keep their normal approval flow.

create table public.question_generation_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id),
  provider text not null,
  model text,
  material_summary text not null,
  requested integer not null,
  produced integer not null default 0,
  rejected integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.question_generation_batches enable row level security;

create policy "question batches: admins do everything"
  on public.question_generation_batches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger question_generation_batches_audit
  after insert or update or delete on public.question_generation_batches
  for each row execute function public.audit_row_change();

alter table public.questions
  add column generation_batch_id uuid references public.question_generation_batches (id) on delete set null;

create index questions_generation_batch_idx on public.questions (generation_batch_id);
