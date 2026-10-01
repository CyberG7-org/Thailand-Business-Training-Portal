import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listBusinessCategories } from '@/lib/db/business-categories';
import { getDbdRecord, listDbdDocuments } from '@/lib/db/dbd-records';
import { currentAddress } from '@/lib/db/training-sheet';
import { parseStoredExtraction } from '@/lib/db/extraction';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { createSupabaseServerClient } from '@/lib/db/server';
import { countAssignmentsBehind, listVersions } from '@/lib/db/training-versions';
import { listOpenExceptions } from '@/lib/db/validation';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { DbdRecordForm } from '../dbd-record-form';
import { AddressPanel } from './address-panel';
import { CategoryPanel } from './category-panel';
import { CoveragePanel } from './coverage-panel';
import { ExceptionsPanel } from './exceptions-panel';
import { TrainingVersionsPanel } from './training-versions-panel';
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

  // Derived on the fly when not stored yet (a record saved before P17a); never written on a GET.
  const address = await currentAddress(db, record, structured);
  const categories = await listBusinessCategories(db, { activeOnly: true });
  const labelOf = (c: (typeof categories)[number]) =>
    locale === 'en' ? c.label_en : locale === 'zh' ? c.label_zh : c.label_th;
  const coverage = conceptCoverage(
    buildFactSheet({ record, structured, address, role: null }),
    'company',
  );
  const versions = await listVersions(db, record.id);
  const activeVersion = versions.find((v) => v.status === 'active') ?? null;
  const behind = activeVersion ? await countAssignmentsBehind(db, record.id, activeVersion.id) : 0;
  // What the validators found (P17c), and who accepted the record.
  const exceptions = await listOpenExceptions(db, record.id);
  const blockers = exceptions.filter((e) => e.blocks === 'acceptance').length;
  const { data: confirmer } = record.confirmed_by
    ? await db
        .from('profiles')
        .select('display_name, login_id')
        .eq('id', record.confirmed_by)
        .maybeSingle()
    : { data: null };

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

  const tn = await getTranslations('admin.nav');
  return (
    <section className="grid gap-6">
      <Link href="/admin/users#create-dbd" className="staff-link text-sm">
        ← {tn('users')}
      </Link>
      <h1 className="staff-title">{record.company_name_th ?? t('untitled')}</h1>
      {record.confirmed_automatically && record.extraction_status === 'confirmed' && (
        <p data-testid="confirmed-automatically" className="staff-notice-ok max-w-2xl">
          {t('confirmedAutomatically')}
        </p>
      )}
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
        acceptance={{
          blockers,
          confirmedByName: confirmer?.display_name ?? confirmer?.login_id ?? null,
          automatic: record.confirmed_automatically,
        }}
        reading={reading}
        extractionAvailable={getDbdExtractor() !== null}
      />
      <ExceptionsPanel recordId={record.id} exceptions={exceptions} />
      <CoveragePanel coverage={coverage} />
      <TrainingVersionsPanel versions={versions} behind={behind} />
      {error === 'vector_unavailable' && (
        <p
          role="alert"
          data-testid="vector-unavailable-banner"
          className="staff-notice-warn max-w-2xl"
        >
          {t('index.removeUnavailable')}
        </p>
      )}
      {extraction === 'failed' && (
        <p data-testid="autofill-banner" className="staff-notice-warn max-w-2xl">
          {t('uploadedButNotRead', { reason: extractionError ?? '' })}
        </p>
      )}
      {extraction === 'skipped' && (
        <p data-testid="autofill-banner" className="staff-notice-info max-w-2xl">
          {t('extractionNotConfigured')}
        </p>
      )}
      {suggestions && <p className="staff-notice-warn max-w-2xl">{t('reviewSuggestions')}</p>}
      <DbdRecordForm
        record={record}
        suggestions={suggestions}
        business={structured.business ?? null}
        interview={structured.interview ?? null}
        provenance={structured.provenance ?? {}}
        documentNames={documents.map((d) => d.original_name)}
      />
      <AddressPanel address={address} stored={Boolean(structured.address)} />
      <CategoryPanel
        recordId={record.id}
        assignment={structured.category ?? null}
        options={categories.map((c) => ({ key: c.key, label: labelOf(c) }))}
      />
      <InterviewForm
        recordId={record.id}
        answers={structured.interview ?? EMPTY_INTERVIEW_PROFILE}
      />
      <AskDocuments recordId={record.id} />
    </section>
  );
}
