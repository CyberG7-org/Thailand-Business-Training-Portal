'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FileIcon } from '@/components/icons';
import { PdfFilePicker } from '@/components/staff/pdf-file-picker';
import { canRequestIndex, type IndexStatus } from '@/lib/domain/rag/index-status';
import {
  recheckRecordAction,
  extractDocumentAction,
  removeDocumentAction,
  retryIndexAction,
  type ToolState,
} from '../actions';
import { PackPreviewCard } from '../pack-preview';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';
import type { PackGroup } from '@/lib/domain/pack/sort';
import { showRecordTab } from './record-tabs';

const initial: ToolState = { ok: false, error: null };

const EXTRACT_ERROR_KEYS = [
  'not_configured',
  'provider',
  'invalid_output',
  'no_document',
  'not_allowed',
  'too_large',
] as const;

export type { IndexStatus };

export type DocumentSummary = {
  id: string;
  name: string;
  group: PackGroup;
  type: string | null;
  sizeBytes: number;
  pageCount: number | null;
  indexStatus: IndexStatus;
  indexedPages: number;
  indexError: string | null;
};

/** What the documents card says about the reading in progress (D46). */
export type ReadingState = {
  status: 'queued' | 'running' | 'failed' | 'deferred';
  error: string | null;
};

function FillOutcome({ state }: { state: ToolState }) {
  const t = useTranslations('admin.dbd');
  if (!state.ok) return null;
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === state.extractionError);
  if (state.extraction === 'queued') {
    return (
      <p role="status" data-testid="extract-status" className="text-sm text-ink-700">
        {t('readingQueued')}
      </p>
    );
  }
  if (state.extraction === 'failed') {
    return (
      <p role="alert" data-testid="extract-error" className="text-sm text-warn-700">
        {t('uploadedButNotRead', {
          reason: extractErrorKey
            ? t(`extractErrors.${extractErrorKey}`)
            : (state.extractionError ?? ''),
        })}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-ok-600">
      {t('uploaded')}
    </p>
  );
}

const INDEX_TONE: Partial<Record<IndexStatus, string>> = {
  ready: 'bg-ok-50 text-ok-600',
  failed: 'bg-bad-50 text-bad-600',
};

/**
 * The Documents tab's card: every uploaded file with what kind it is and how far its indexing
 * got, a way to add more (they are read in the background, D46), and "Read the documents again".
 * A confirmed company keeps its DBD pack locked while invoices and agreements remain maintainable.
 */
const GROUPS: PackGroup[] = ['pack', 'invoice', 'agreement'];

export function DocumentsCard({
  id,
  status,
  documents,
  reading,
  extractionAvailable,
}: {
  id: string;
  status: string;
  documents: DocumentSummary[];
  reading: ReadingState | null;
  extractionAvailable: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const readingErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === reading?.error);
  const {
    state: uploadState,
    pending: uploading,
    submit: submitUpload,
    inspect,
    preview,
  } = useDirectUpload({ locale, id, redirect: false });
  const [extractState, extractAction, extracting] = useActionState(extractDocumentAction, initial);
  const uploadErrorKey = UPLOAD_ERROR_KEYS.find((k) => k === uploadState.error);
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === extractState.error);
  const locked = status === 'confirmed';
  const canExtract = documents.length > 0 && !locked && extractionAvailable;
  const typeLabel = (type: string | null) =>
    type ? t(`documentTypes.${type}` as 'documentTypes.certificate') : t('documentTypes.unknown');

  return (
    <section className="staff-card divide-y divide-ink-100 p-0 md:p-0" data-testid="documents-card">
      <div className="grid gap-3 p-4 md:px-6 md:py-5">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{t('documents')}</h2>
          {documents.length > 0 && <p className="text-sm text-ink-500">{t('index.hint')}</p>}
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-ink-700">{t('documentMissing')}</p>
        ) : (
          <div className="grid gap-4" data-testid="document-list">
            {GROUPS.filter((group) => documents.some((d) => d.group === group)).map((group) => (
              <div key={group} className="grid gap-2" data-testid={`documents-${group}`}>
                <h3 className="text-sm font-semibold text-ink-700">
                  {t(`documentGroups.${group}`)}
                </h3>
                <ul className="grid gap-2 text-sm">
                  {documents
                    .filter((d) => d.group === group)
                    .map((doc) => (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-ink-100 px-3 py-2"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="shrink-0 text-brand-600">
                            <FileIcon />
                          </span>
                          <span className="truncate font-medium text-ink-900">{doc.name}</span>
                        </span>
                        {group === 'pack' && (
                          <span className="staff-tag" data-testid="document-type">
                            {typeLabel(doc.type)}
                          </span>
                        )}
                        <span className="text-ink-500 tabular-nums">
                          {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </span>
                        {group === 'pack' && (
                          <span
                            data-testid="index-status"
                            data-status={doc.indexStatus}
                            title={doc.indexError ?? undefined}
                            className={`staff-tag ${INDEX_TONE[doc.indexStatus] ?? ''}`}
                          >
                            {t(`index.status.${doc.indexStatus}` as 'index.status.ready', {
                              done: doc.indexedPages,
                              total: doc.pageCount ?? 0,
                            })}
                          </span>
                        )}
                        {group === 'pack' && canRequestIndex(doc.indexStatus) && (
                          <form action={retryIndexAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="id" value={id} />
                            <input type="hidden" name="documentId" value={doc.id} />
                            <button
                              type="submit"
                              className="staff-btn-ghost staff-btn-sm"
                              data-testid="reindex-button"
                            >
                              {doc.indexStatus === 'failed'
                                ? t('index.retry')
                                : doc.indexStatus === 'ready'
                                  ? t('index.reindex')
                                  : t('index.start')}
                            </button>
                          </form>
                        )}
                        {(!locked || group !== 'pack') && (
                          <form action={removeDocumentAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="id" value={id} />
                            <input type="hidden" name="documentId" value={doc.id} />
                            <button
                              type="submit"
                              className="staff-btn-ghost staff-btn-sm text-bad-600"
                            >
                              {t('removeDocument')}
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {reading && (
          <p
            role={reading.status === 'failed' ? 'alert' : 'status'}
            data-testid="reading-status"
            data-state={reading.status}
            className={reading.status === 'failed' ? 'staff-notice-warn' : 'staff-notice-info'}
          >
            {reading.status === 'failed'
              ? t('readingFailed', {
                  reason: readingErrorKey
                    ? t(`extractErrors.${readingErrorKey}`)
                    : (reading.error ?? ''),
                })
              : reading.status === 'deferred'
                ? t('deferredFill')
                : t('readingQueued')}
          </p>
        )}
      </div>

      <div className="grid gap-3 p-4 md:px-6 md:py-5">
        {/* The files go from the browser straight to the bucket (see useDirectUpload). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitUpload(e.currentTarget);
          }}
          className="grid gap-3"
        >
          <PdfFilePicker
            name="document"
            label={t('addDocuments')}
            hint={extractionAvailable ? t('uploadFillsHint') : t('extractionNotConfigured')}
            strongLabel
            onChosen={inspect}
            preview={preview && <PackPreviewCard preview={preview} />}
          />
          {uploadState.error && (
            <p role="alert" className="text-sm text-bad-600">
              {uploadErrorKey ? t(`errors.${uploadErrorKey}`) : uploadState.error}
            </p>
          )}
          <FillOutcome state={uploadState} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={uploading} className="staff-btn">
              {uploading ? t('uploadingAndReading') : t('uploadAndFill')}
            </button>
          </div>
        </form>
        {!locked && (
          <form action={extractAction} className="grid gap-2 border-t border-ink-100 pt-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-ink-500">{t('extractHint')}</p>
            <button
              type="submit"
              disabled={!canExtract || extracting || uploading}
              data-testid="extract-button"
              className="staff-btn-ghost justify-self-start"
            >
              {extracting ? t('extracting') : t('reExtract')}
            </button>
            {extractState.error && (
              <p role="alert" data-testid="extract-error" className="text-sm text-bad-600">
                {extractErrorKey ? t(`extractErrors.${extractErrorKey}`) : extractState.error}
              </p>
            )}
            <FillOutcome state={extractState} />
          </form>
        )}
      </div>
    </section>
  );
}

/** One line of "Before it can be used": done, or still in the way. */
export type AcceptanceCheck = { key: string; label: string; done: boolean };

/**
 * The status column's first card (P17c): where acceptance stands, as a list ticked like the
 * learner form's — the documents read, nothing missing, no conflicts — then who accepted, or
 * "Check again" with a way to the exceptions that stand in the way.
 */
export function StatusCard({
  id,
  status,
  checks,
  acceptance,
}: {
  id: string;
  status: string;
  checks: AcceptanceCheck[];
  acceptance: { blockers: number; confirmedByName: string | null; automatic: boolean };
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [recheckState, recheckAction, rechecking] = useActionState(recheckRecordAction, initial);
  const locked = status === 'confirmed';

  return (
    <form action={recheckAction} className="staff-card grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-semibold text-ink-900">{t('checks.title')}</p>
      {/* The stored status, for the suite and for support; people read the badge in the header. */}
      <span hidden data-testid="record-status">
        {status}
      </span>
      <ul className="grid gap-2" data-testid="acceptance-checks">
        {checks.map(({ key, label, done }) => (
          <li
            key={key}
            data-testid={`check-${key}`}
            data-done={done}
            className="flex min-h-6 items-center gap-3 text-sm"
          >
            <span
              aria-hidden="true"
              className={`grid size-5 shrink-0 place-items-center rounded-full ${
                done ? 'bg-ok-600 text-white' : 'bg-ink-100 ring-1 ring-ink-300 ring-inset'
              }`}
            >
              {done && (
                <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor">
                  <path d="M3.5 8.5l3 3 6-7" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span className={done ? 'text-ink-900' : 'text-ink-500'}>{label}</span>
            <span className="sr-only">{done ? t('checks.done') : t('checks.todo')}</span>
          </li>
        ))}
      </ul>
      {locked ? (
        <p className="staff-notice-ok" data-testid="acceptance-state">
          {acceptance.automatic
            ? t('acceptance.acceptedAuto')
            : t('acceptance.accepted', { name: acceptance.confirmedByName ?? '—' })}
        </p>
      ) : (
        <p
          className="staff-notice-warn"
          data-testid="acceptance-state"
          data-blockers={acceptance.blockers}
        >
          {acceptance.blockers > 0
            ? t('acceptance.waiting', { count: acceptance.blockers })
            : t('acceptance.blocked')}
        </p>
      )}
      {recheckState.error && recheckState.error !== 'blocked' && (
        <p role="alert" data-testid="recheck-error" className="text-sm text-bad-600">
          {recheckState.error}
        </p>
      )}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={rechecking}
            data-testid="recheck-button"
            className="staff-btn-ghost flex-1"
          >
            {t('recheck')}
          </button>
          {acceptance.blockers > 0 && (
            <button
              type="button"
              onClick={() => showRecordTab('exceptions')}
              className="staff-btn-ghost flex-1 text-brand-600"
            >
              {t('checks.openExceptions')}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
