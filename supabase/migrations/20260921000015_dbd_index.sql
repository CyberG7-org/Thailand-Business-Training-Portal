-- P14: DBD packs as a retrieval index (decisions D40/D41). Page transcripts are the source of
-- truth; chunks mirror the vector store's records; index_jobs drive the sliced reading.

alter table public.dbd_documents
  add column page_count integer,
  add column index_status text not null default 'none'
    check (index_status in ('none', 'queued', 'indexing', 'ready', 'failed', 'skipped')),
  add column indexed_pages integer not null default 0,
  add column index_error text;

create table public.dbd_pages (
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  page integer not null check (page > 0),
  text text not null,
  model text,
  transcribed_at timestamptz not null default now(),
  primary key (document_id, page)
);

create table public.dbd_chunks (
  id text primary key,
  record_id uuid not null references public.dbd_records (id) on delete cascade,
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  document_type text,
  page integer not null,
  chunk_index integer not null,
  chunk_text text not null,
  char_count integer not null,
  created_at timestamptz not null default now()
);
create index dbd_chunks_record_idx on public.dbd_chunks (record_id, document_id, page);

create table public.index_jobs (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.dbd_records (id) on delete cascade,
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  kind text not null default 'index' check (kind in ('index', 'reindex')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  next_page integer not null default 1,
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index index_jobs_due_idx on public.index_jobs (status, locked_until, created_at);
-- One live job per document; retry/re-index reset it instead of queueing a second one.
create unique index index_jobs_one_live_per_document
  on public.index_jobs (document_id) where status in ('queued', 'running');

create trigger index_jobs_updated_at
  before update on public.index_jobs
  for each row execute function public.set_updated_at();

alter table public.dbd_pages enable row level security;
alter table public.dbd_chunks enable row level security;
alter table public.index_jobs enable row level security;

-- Transcripts and chunks: admins read, only the worker (service role) writes.
create policy "dbd pages: admins read" on public.dbd_pages
  for select to authenticated using (public.is_admin());
create policy "dbd chunks: admins read" on public.dbd_chunks
  for select to authenticated using (public.is_admin());
-- Jobs: admins queue, retry and re-index from the record page.
create policy "index jobs: admins do everything" on public.index_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Leases due jobs for one worker run. A job whose lease expired while `running` counts as a
-- failed attempt (the previous run died); a `queued` continuation does not.
create or replace function public.claim_index_jobs(p_limit integer default 1)
returns setof public.index_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id from public.index_jobs
    where status in ('queued', 'running')
      and (locked_until is null or locked_until <= now())
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.index_jobs j
     set status = 'running',
         attempts = j.attempts + (case when j.status = 'running' then 1 else 0 end),
         locked_until = now() + interval '10 minutes'
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_index_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_index_jobs(integer) to service_role;
