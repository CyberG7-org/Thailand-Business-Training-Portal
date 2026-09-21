-- P14c (after review): the transcript path is a resumable job of its own, and every swept page
-- batch is cached so a killed run never repeats a model call (decision D42).

alter table public.index_jobs drop constraint index_jobs_kind_check;
alter table public.index_jobs
  add constraint index_jobs_kind_check check (kind in ('index', 'reindex', 'transcript'));

create table public.dbd_sweeps (
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  first_page integer not null check (first_page > 0),
  last_page integer not null check (last_page >= first_page),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (document_id, first_page)
);

alter table public.dbd_sweeps enable row level security;

-- Like transcripts and chunks: admins read, only the worker (service role) writes.
create policy "dbd sweeps: admins read" on public.dbd_sweeps
  for select to authenticated using (public.is_admin());
