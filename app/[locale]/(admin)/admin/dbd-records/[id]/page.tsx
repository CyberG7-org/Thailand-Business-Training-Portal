import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { getDbdRecord, listDbdDocuments } from '@/lib/db/dbd-records';
import { parseStoredExtraction } from '@/lib/db/extraction';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { missingFieldsForConfirmation } from '@/lib/domain/dbd-record';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { createSupabaseServerClient } from '@/lib/db/server';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { DbdRecordForm } from '../dbd-record-form';
import { InterviewForm } from './interview-form';
import { AskDocuments } from './ask-documents';
import { RecordTools, type DocumentSummary, type ReadingState } from './record-tools';

// Upload + extraction run inside the page's server actions; allow the full serverless window.
export const maxDuration = 60;

export default async function DbdRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    extraction?: string;
    extractionError?: string;
    error?: string;
  }>;
}) {
  const { locale, id } = await params;
  const { extraction, extractionError, error } = await searchParams;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) notFound();
  const documents = await listDbdDocuments(db, id);
  const structured = readStructuredData(record.structured_data);
  const t = await getTranslations('admin.dbd');

  // The reading runs in the background (D46): show the latest extract job, or that oversized
  // documents are still being indexed before their transcripts can fill the record.
  const { data: extractJob } = await db
    .from('index_jobs')
    .select('status, last_error')
    .eq('record_id', id)
    .eq('kind', 'extract')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let reading: ReadingState | null = null;
  if (extractJob?.status === 'queued' || extractJob?.status === 'running') {
    reading = { status: extractJob.status, error: null };
  } else if (extractJob?.status === 'failed') {
    reading = { status: 'failed', error: extractJob.last_error };
  } else if (
    record.extraction_raw === null &&
    documents.some(
      (d) =>
        d.page_count !== null &&
        d.page_count > directReadMaxPages() &&
        !['ready', 'failed', 'skipped'].includes(d.index_status),
    )
  ) {
    reading = { status: 'deferred', error: null };
  }

  // Suggestions only pre-fill the form; the stored extraction is validated before use.
  let suggestions: ExtractionSuggestions | null = null;
  if (record.extraction_raw && record.extraction_status !== 'confirmed') {
    const parsed = parseStoredExtraction(record.extraction_raw);
    if (parsed) suggestions = extractionToFormValues(parsed);
  }

  return (
    <section className="grid gap-6">
      <Link href="/admin/dbd-records" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{record.company_name_th ?? t('untitled')}</h1>
      <RecordTools
        id={record.id}
        status={record.extraction_status}
        documents={documents.map((d) => ({
          id: d.id,
          name: d.original_name,
          type: d.document_type,
          sizeBytes: d.size_bytes,
          pageCount: d.page_count,
          indexStatus: d.index_status as DocumentSummary['indexStatus'],
          indexedPages: d.indexed_pages,
          indexError: d.index_error,
        }))}
        missing={missingFieldsForConfirmation(record, structured.interview ?? null)}
        reading={reading}
        extractionAvailable={getDbdExtractor() !== null}
      />
      {error === 'vector_unavailable' && (
        <p
          role="alert"
          data-testid="vector-unavailable-banner"
          className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {t('index.removeUnavailable')}
        </p>
      )}
      {extraction === 'failed' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {t('uploadedButNotRead', { reason: extractionError ?? '' })}
        </p>
      )}
      {extraction === 'skipped' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border bg-gray-50 p-3 text-sm"
        >
          {t('extractionNotConfigured')}
        </p>
      )}
      {suggestions && (
        <p className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t('reviewSuggestions')}
        </p>
      )}
      <DbdRecordForm
        record={record}
        suggestions={suggestions}
        business={structured.business ?? null}
        interview={structured.interview ?? null}
        provenance={structured.provenance ?? {}}
        documentNames={documents.map((d) => d.original_name)}
      />
      <InterviewForm
        recordId={record.id}
        answers={structured.interview ?? EMPTY_INTERVIEW_PROFILE}
      />
      <AskDocuments recordId={record.id} />
    </section>
  );
}
