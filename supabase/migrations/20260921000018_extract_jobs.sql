-- The direct read of a pack is a job too (decision D46): reading a scanned pack with the model
-- takes longer than a request may last, so the upload only registers the documents and the cron
-- reads them. An extract job is keyed by the record (through its first document); index and
-- transcript jobs keep their own one-live-per-document rule.

alter table public.index_jobs drop constraint index_jobs_kind_check;
alter table public.index_jobs
  add constraint index_jobs_kind_check
  check (kind in ('index', 'reindex', 'transcript', 'extract'));

drop index public.index_jobs_one_live_per_document;

create unique index index_jobs_one_live_index_per_document
  on public.index_jobs (document_id)
  where status in ('queued', 'running') and kind in ('index', 'reindex');

create unique index index_jobs_one_live_transcript_per_document
  on public.index_jobs (document_id)
  where status in ('queued', 'running') and kind = 'transcript';

create unique index index_jobs_one_live_extract_per_record
  on public.index_jobs (record_id)
  where status in ('queued', 'running') and kind = 'extract';
