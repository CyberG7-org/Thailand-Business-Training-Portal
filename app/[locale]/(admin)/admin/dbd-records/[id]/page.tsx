import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { BUSINESS_NATURES } from '@/lib/domain/business-natures';
import { parseStoredExtraction } from '@/lib/db/extraction';
import { companyStatus } from '@/lib/domain/auto-confirm';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { displayLoginId } from '@/lib/domain/login-id';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { withStandardAnswers } from '@/lib/domain/standard-answers';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { DbdRecordForm } from '../dbd-record-form';
import { AddressPanel } from './address-panel';
import { CategoryPanel } from './category-panel';
import { ExceptionsPanel } from './exceptions-panel';
import { LinksForm } from './links-form';
import { withBusinessNatureFigures } from '@/lib/domain/invoices/answers';
import type { PackGroup } from '@/lib/domain/pack/sort';
import { InterviewForm } from './interview-form';
import { AskDocuments } from './ask-documents';
import { loadRecord } from './record-data';
import { isRecordTab, type RecordTab } from './record-tab-keys';
import { RecordTabs } from './record-tabs';
import { DocumentsCard, type DocumentSummary, type ReadingState } from './record-tools';

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
    tab?: string;
  }>;
}) {
  const { locale, id } = await params;
  const { extraction, extractionError, error, tab } = await searchParams;
  const staff = await requireStaff(locale);
  // Read once for the page and the status column under the sidebar (`@side`).
  const loaded = await loadRecord(id);
  if (!loaded) notFound();
  const { db, record, structured, documents, exceptions, address } = loaded;
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

  const tc = await getTranslations('admin.createDbd');
  const { data: team } =
    staff.role === 'admin' && record.team_id
      ? await db.from('profiles').select('login_id').eq('id', record.team_id).maybeSingle()
      : { data: null };

  const confirmed = record.extraction_status === 'confirmed';
  // Bank interview figures come from the manager-selected business category.
  const filled = withBusinessNatureFigures(
    withStandardAnswers(structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
      address: address.full || record.head_office_address,
      website: record.website,
    }),
    structured.category?.key,
  );
  const answered = [
    filled.monthly_revenue,
    filled.average_transaction,
    filled.monthly_transactions,
  ].filter((value) => Boolean(value?.trim())).length;
  const status = companyStatus(
    record,
    reading ? (reading.status === 'failed' ? 'failed' : 'open') : null,
  );
  const statusTone =
    status === 'confirmed' || status === 'confirmed_auto'
      ? 'bg-ok-50 text-ok-600'
      : status === 'unread'
        ? 'bg-bad-50 text-bad-600'
        : 'bg-warn-50 text-warn-700';
  // Straight after an upload (`?extraction=`) the reading is what to watch.
  const initialTab: RecordTab = isRecordTab(tab)
    ? tab
    : error === 'vector_unavailable' || extraction
      ? 'documents'
      : 'details';

  return (
    <section className="grid gap-5">
      <div className="grid gap-2">
        <Link href="/admin/users?tab=companies" className="staff-link w-fit text-sm">
          ← {tc('companies')}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="staff-title">{record.company_name_th ?? t('untitled')}</h1>
          <span
            className={`staff-tag text-sm ${statusTone}`}
            data-testid="record-company-status"
            data-status={status}
          >
            {tc(`statuses.${status}`)}
          </span>
          {team && (
            <span className="staff-tag bg-brand-100 text-sm text-brand-700">
              {t('teamChip', { code: displayLoginId(team.login_id) })}
            </span>
          )}
          {record.juristic_id && (
            <span className="font-mono text-sm text-ink-500 tabular-nums">
              {record.juristic_id}
            </span>
          )}
        </div>
        {record.confirmed_automatically && confirmed && (
          <p data-testid="confirmed-automatically" className="staff-notice-ok max-w-2xl">
            {t('confirmedAutomatically')}
          </p>
        )}
      </div>
      <RecordTabs
        initialTab={initialTab}
        labels={{
          details: t('tabs.details'),
          interview: t('tabs.interview'),
          documents: t('tabs.documents'),
          exceptions: t('tabs.exceptions'),
        }}
        badges={{
          interview: { text: `${answered}/3` },
          documents: { text: String(documents.length) },
          ...(exceptions.length > 0
            ? { exceptions: { text: String(exceptions.length), warn: true } }
            : {}),
        }}
        panels={{
          details: (
            <>
              {suggestions && <p className="staff-notice-warn">{t('reviewSuggestions')}</p>}
              <DbdRecordForm
                record={record}
                suggestions={suggestions}
                business={structured.business ?? null}
                interview={structured.interview ?? null}
                provenance={structured.provenance ?? {}}
                documentNames={documents.map((d) => d.original_name)}
              />
              <AddressPanel address={address} stored={Boolean(structured.address)} />
            </>
          ),
          interview: (
            <div className="grid gap-4">
              <CategoryPanel
                recordId={record.id}
                assignment={structured.category ?? null}
                options={BUSINESS_NATURES.map(([key, label]) => ({ key, label }))}
              />
              <InterviewForm figures={filled} />
            </div>
          ),
          documents: (
            <>
              {error === 'vector_unavailable' && (
                <p
                  role="alert"
                  data-testid="vector-unavailable-banner"
                  className="staff-notice-warn"
                >
                  {t('index.removeUnavailable')}
                </p>
              )}
              {extraction === 'failed' && (
                <p data-testid="autofill-banner" className="staff-notice-warn">
                  {t('uploadedButNotRead', { reason: extractionError ?? '' })}
                </p>
              )}
              {extraction === 'skipped' && (
                <p data-testid="autofill-banner" className="staff-notice-info">
                  {t('extractionNotConfigured')}
                </p>
              )}
              <DocumentsCard
                id={record.id}
                status={record.extraction_status}
                documents={documents.map((d) => ({
                  id: d.id,
                  name: d.original_name,
                  group: d.group as PackGroup,
                  type: d.document_type,
                  sizeBytes: d.size_bytes,
                  pageCount: d.page_count,
                  indexStatus: d.index_status as DocumentSummary['indexStatus'],
                  indexedPages: d.indexed_pages,
                  indexError: d.index_error,
                }))}
                reading={reading}
                extractionAvailable={getDbdExtractor() !== null}
              />
              <LinksForm
                recordId={record.id}
                website={record.website}
                facebookPage={record.facebook_page}
                facebookStatus={
                  structured.facebook_source?.url === record.facebook_page
                    ? structured.facebook_source.status
                    : null
                }
              />
              <AskDocuments recordId={record.id} />
            </>
          ),
          exceptions: <ExceptionsPanel recordId={record.id} exceptions={exceptions} />,
        }}
      />
    </section>
  );
}
