import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listBusinessCategories } from '@/lib/db/business-categories';
import { parseStoredExtraction } from '@/lib/db/extraction';
import { companyStatus } from '@/lib/domain/auto-confirm';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { displayLoginId } from '@/lib/domain/login-id';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import {
  ASKED_INTERVIEW_FIELDS,
  STANDARD_ANSWER_FIELDS,
  withStandardAnswers,
  type StandardAnswerField,
} from '@/lib/domain/standard-answers';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { DbdRecordForm } from '../dbd-record-form';
import { AddressPanel } from './address-panel';
import { CategoryPanel } from './category-panel';
import { ExceptionsPanel } from './exceptions-panel';
import { LinksForm } from './links-form';
import { summarizeInvoices } from '@/lib/domain/invoices/arithmetic';
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

  const categories = await listBusinessCategories(db, { activeOnly: true });
  const labelOf = (c: (typeof categories)[number]) =>
    locale === 'en' ? c.label_en : locale === 'zh' ? c.label_zh : c.label_th;

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
  // The invoices job (D101), beside the pack's.
  const { data: invoicesJob } = await db
    .from('index_jobs')
    .select('status, last_error')
    .eq('record_id', id)
    .eq('kind', 'invoices')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const invoiceReading: ReadingState | null =
    invoicesJob?.status === 'queued' || invoicesJob?.status === 'running'
      ? { status: invoicesJob.status, error: null }
      : invoicesJob?.status === 'failed'
        ? { status: 'failed', error: invoicesJob.last_error }
        : null;
  // The invoice documents in upload order carry the rows of the read, by index.
  const invoiceDocuments = documents.filter((d) => d.group === 'invoice');
  const invoiceRows = structured.invoices?.rows ?? [];
  const invoiceSummary = structured.invoices ? summarizeInvoices(invoiceRows) : null;
  const invoiceOf = (documentId: string) => {
    const position = invoiceDocuments.findIndex((d) => d.id === documentId);
    const row = invoiceRows.find((r) => r.index === position + 1);
    if (!structured.invoices || !row) return null;
    return {
      date: row.issue_date,
      total: row.grand_total,
      setAside: invoiceSummary?.setAside.find((s) => s.index === row.index)?.reason ?? null,
    };
  };
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
  // Level 4 asks five questions (D91); the rest are standard answers, shown as the sheet reads
  // them.
  const answered = ASKED_INTERVIEW_FIELDS.filter(
    (field) => String(structured.interview?.[field] ?? '').trim() !== '',
  ).length;
  const filled = withStandardAnswers(structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: address.full || record.head_office_address,
  });
  const standardAnswers = Object.fromEntries(
    STANDARD_ANSWER_FIELDS.map((field) => [field, filled[field]]),
  ) as Record<StandardAnswerField, string | null>;
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
          interview: { text: `${answered}/${ASKED_INTERVIEW_FIELDS.length}` },
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
              <CategoryPanel
                recordId={record.id}
                assignment={structured.category ?? null}
                options={categories.map((c) => ({ key: c.key, label: labelOf(c) }))}
              />
            </>
          ),
          interview: (
            <InterviewForm
              recordId={record.id}
              answers={structured.interview ?? EMPTY_INTERVIEW_PROFILE}
              standard={standardAnswers}
              invoices={invoiceSummary}
            />
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
                  invoice: d.group === 'invoice' ? invoiceOf(d.id) : null,
                  type: d.document_type,
                  sizeBytes: d.size_bytes,
                  pageCount: d.page_count,
                  indexStatus: d.index_status as DocumentSummary['indexStatus'],
                  indexedPages: d.indexed_pages,
                  indexError: d.index_error,
                }))}
                reading={reading}
                invoiceReading={invoiceReading}
                extractionAvailable={getDbdExtractor() !== null}
              />
              <LinksForm
                recordId={record.id}
                website={record.website}
                facebookPage={record.facebook_page}
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
