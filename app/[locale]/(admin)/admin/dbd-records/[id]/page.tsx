import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdRecord, listDbdDocuments } from '@/lib/db/dbd-records';
import { parseStoredExtraction } from '@/lib/db/extraction';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { createSupabaseServerClient } from '@/lib/db/server';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { DbdRecordForm } from '../dbd-record-form';
import { InterviewForm } from './interview-form';
import { AskDocuments } from './ask-documents';
import { RecordTools, type DocumentSummary } from './record-tools';

// Upload + extraction run inside the page's server actions; allow the full serverless window.
export const maxDuration = 60;

export default async function DbdRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    extraction?: string;
    applied?: string;
    extractionError?: string;
    transcripts?: string;
    error?: string;
  }>;
}) {
  const { locale, id } = await params;
  const { extraction, applied, extractionError, transcripts, error } = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) notFound();
  const documents = await listDbdDocuments(db, id);
  const structured = readStructuredData(record.structured_data);
  const t = await getTranslations('admin.dbd');

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
      {extraction === 'filled' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border border-green-300 bg-green-50 p-3 text-sm"
        >
          {t('autoFilledReview', { count: Number(applied ?? 0) })}
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
      {(extraction === 'deferred' || extraction === 'queued') && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border bg-gray-50 p-3 text-sm"
        >
          {t(extraction === 'queued' ? 'queuedFill' : 'deferredFill')}
        </p>
      )}
      {extraction === 'filled' && (transcripts === 'queued' || transcripts === 'pending_index') && (
        <p
          data-testid="transcripts-note"
          className="max-w-2xl rounded border bg-gray-50 p-3 text-sm"
        >
          {t(transcripts === 'queued' ? 'queuedFill' : 'deferredFill')}
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
      {suggestions && extraction !== 'filled' && (
        <p className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t('reviewSuggestions')}
        </p>
      )}
      <DbdRecordForm
        record={record}
        suggestions={suggestions}
        business={structured.business ?? null}
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
