-- P18a: the company pack (spec 2026-10-06, D101). A manager uploads one zip: the DBD pack, the
-- invoices, the agreements and the company's addresses. The invoices are read into rows and the
-- money facts computed from them; the agreements are stored only; the addresses go on the record.

-- 1. A document belongs to a group of the pack; invoices and agreements are document types too.
alter table public.dbd_documents
  add column "group" text not null default 'pack'
    check ("group" in ('pack', 'invoice', 'agreement'));
comment on column public.dbd_documents."group" is
  'P18a: pack = the DBD documents the reader reads whole; invoice = read into rows; agreement = stored only.';

alter table public.dbd_documents drop constraint dbd_documents_document_type_check;
alter table public.dbd_documents add constraint dbd_documents_document_type_check
  check (document_type in (
    'certificate', 'objectives_sheet', 'shareholder_list', 'memorandum', 'articles', 'other',
    'invoice', 'agreement'
  ));

-- 2. The company's addresses, from the zip's link files; editable on the record.
alter table public.dbd_records
  add column website text,
  add column facebook_page text;

-- 3. The invoice read is a job of its own, run by the same cron as the pack read.
alter table public.index_jobs drop constraint index_jobs_kind_check;
alter table public.index_jobs add constraint index_jobs_kind_check
  check (kind in ('index', 'reindex', 'transcript', 'extract', 'invoices'));

-- 4. Two informational exception kinds: an invoice left out of the arithmetic, too few invoices.
alter table public.training_fact_exceptions drop constraint training_fact_exceptions_kind_check;
alter table public.training_fact_exceptions add constraint training_fact_exceptions_kind_check
  check (kind in (
    'missing', 'low_confidence', 'conflict', 'invalid', 'geo_mismatch', 'category_review',
    'render_failure', 'invoice_set_aside', 'few_invoices'
  ));

-- 5. A record is accepted before its learner exists (D93), so it cannot owe the learner's email
--    and phone, which the name card prints from the learner's own details (D80). It owes what the
--    company does and sells, which the reads now supply.
alter table public.dbd_records drop constraint dbd_confirmed_requires_business_answers;
alter table public.dbd_records add constraint dbd_confirmed_requires_business_answers
  check (
    extraction_status <> 'confirmed'
    or (
      public.interview_answer(structured_data, 'nature_of_business') is not null
      and public.interview_answer(structured_data, 'products_services') is not null
    )
  ) not valid;
comment on constraint dbd_confirmed_requires_business_answers on public.dbd_records is
  'A confirmed record carries what the company does and sells; the certificate holds neither, the reads do (P18a).';
