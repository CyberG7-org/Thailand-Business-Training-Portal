-- P12: three-level DBD model (decision D38). Level 1 gains `province`; Level 2 (business profile)
-- and Level 3 provenance live in `structured_data`; a record can hold several source documents
-- (certificate, objectives sheet, shareholder list, memorandum).

alter table public.dbd_records add column province text;

create table public.dbd_documents (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.dbd_records (id) on delete cascade,
  path text not null unique,
  original_name text not null,
  size_bytes integer not null,
  position integer not null,
  document_type text
    check (document_type in ('certificate', 'objectives_sheet', 'shareholder_list', 'memorandum', 'articles', 'other')),
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  unique (record_id, position)
);

create index dbd_documents_record_idx on public.dbd_documents (record_id, position);

alter table public.dbd_documents enable row level security;

create policy "dbd documents: admins do everything"
  on public.dbd_documents for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger dbd_documents_audit
  after insert or update or delete on public.dbd_documents
  for each row execute function public.audit_row_change();

-- Existing single-document records become one-row document lists.
insert into public.dbd_documents (record_id, path, original_name, size_bytes, position, document_type, uploaded_by)
select id, document_path, 'certificate.pdf', 0, 1, 'certificate', created_by
from public.dbd_records
where document_path is not null;

-- Certificate packs are scans; allow up to 30 MB per file.
update storage.buckets set file_size_limit = 31457280 where id = 'dbd-documents';
