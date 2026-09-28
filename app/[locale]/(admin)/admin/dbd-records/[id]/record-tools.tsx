'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { INTERVIEW_FIELDS } from '@/lib/domain/bank-interview';
import { canRequestIndex, type IndexStatus } from '@/lib/domain/rag/index-status';
import {
  confirmDbdRecordAction,
  extractDocumentAction,
  removeDocumentAction,
  retryIndexAction,
  type ToolState,
} from '../actions';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';

const initial: ToolState = { ok: false, error: null };

/** The two certificate facts confirmation needs; the form labels them in camelCase. */
const CORE_FIELD_LABELS: Record<string, 'fields.juristicId' | 'fields.companyNameTh' | undefined> =
  {
    juristic_id: 'fields.juristicId',
    company_name_th: 'fields.companyNameTh',
  };

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

export function RecordTools({
  id,
  status,
  documents,
  reading,
  extractionAvailable,
  missing,
}: {
  id: string;
  status: string;
  documents: DocumentSummary[];
  reading: ReadingState | null;
  extractionAvailable: boolean;
  /** Everything still to fill in; the record cannot be confirmed while any of it remains. */
  missing: string[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const readingErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === reading?.error);
  const [confirmState, confirmAction, confirming] = useActionState(confirmDbdRecordAction, initial);
  const {
    state: uploadState,
    pending: uploading,
    submit: submitUpload,
  } = useDirectUpload({ locale, id, redirect: false });
  const [extractState, extractAction, extracting] = useActionState(extractDocumentAction, initial);
  const fieldLabel = (f: string) => {
    if ((INTERVIEW_FIELDS as readonly string[]).includes(f)) {
      return t(`interviewFields.${f}` as 'interviewFields.account_purpose');
    }
    const core = CORE_FIELD_LABELS[f];
    return core ? t(core) : f;
  };
  // The action refuses too, in case the record changed in another tab while this one was open.
  const refused = confirmState.error?.startsWith('missing:')
    ? confirmState.error.slice('missing:'.length).split(',')
    : null;
  const uploadErrorKey = UPLOAD_ERROR_KEYS.find((k) => k === uploadState.error);
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === extractState.error);
  const locked = status === 'confirmed';
  const canExtract = documents.length > 0 && !locked && extractionAvailable;
  const typeLabel = (type: string | null) =>
    type ? t(`documentTypes.${type}` as 'documentTypes.certificate') : t('documentTypes.unknown');

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="staff-card grid gap-3">
        <p className="text-sm font-semibold">{t('documents')}</p>
        {documents.length === 0 ? (
          <p className="text-sm">{t('documentMissing')}</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="document-list">
            {documents.map((doc, i) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2">
                <span className="text-ink-500">{i + 1}.</span>
                <span>{doc.name}</span>
                <span className="staff-tag" data-testid="document-type">
                  {typeLabel(doc.type)}
                </span>
                <span className="text-xs text-ink-500">
                  {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
                <span
                  data-testid="index-status"
                  data-status={doc.indexStatus}
                  title={doc.indexError ?? undefined}
                  className={`rounded px-1 text-xs ${
                    doc.indexStatus === 'ready'
                      ? 'bg-ok-50'
                      : doc.indexStatus === 'failed'
                        ? 'bg-bad-50'
                        : 'bg-ink-100'
                  }`}
                >
                  {t(`index.status.${doc.indexStatus}` as 'index.status.ready', {
                    done: doc.indexedPages,
                    total: doc.pageCount ?? 0,
                  })}
                </span>
                {canRequestIndex(doc.indexStatus) && (
                  <form action={retryIndexAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <button
                      type="submit"
                      className="staff-link text-xs"
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
                {!locked && (
                  <form action={removeDocumentAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <button type="submit" className="text-xs text-bad-600 underline">
                      {t('removeDocument')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {documents.length > 0 && <p className="text-xs text-ink-500">{t('index.hint')}</p>}
        {reading && (
          <p
            role={reading.status === 'failed' ? 'alert' : 'status'}
            data-testid="reading-status"
            data-state={reading.status}
            className={`rounded p-2 text-sm ${
              reading.status === 'failed' ? 'bg-warn-50 text-warn-700' : 'bg-ink-50 text-ink-700'
            }`}
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

        <div className="grid gap-2 border-t pt-3">
          <p className="text-xs text-ink-500">
            {extractionAvailable ? t('uploadFillsHint') : t('extractionNotConfigured')}
          </p>
          {/* The files go from the browser straight to the bucket (see useDirectUpload). */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitUpload(e.currentTarget);
            }}
            className="grid gap-2"
          >
            <input
              name="document"
              type="file"
              accept="application/pdf"
              multiple
              required
              className="text-sm"
            />
            {uploadState.error && (
              <p role="alert" className="text-sm text-bad-600">
                {uploadErrorKey ? t(`errors.${uploadErrorKey}`) : uploadState.error}
              </p>
            )}
            <FillOutcome state={uploadState} />
            <button
              type="submit"
              disabled={uploading || locked}
              className="staff-btn-ghost justify-self-start"
            >
              {uploading ? t('uploadingAndReading') : t('uploadAndFill')}
            </button>
          </form>
          <form action={extractAction} className="grid gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={!canExtract || extracting || uploading}
              data-testid="extract-button"
              className="staff-btn-ghost justify-self-start"
              title={t('extractHint')}
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
        </div>
      </div>

      <form action={confirmAction} className="staff-card grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">
          {t('status')}: <span data-testid="record-status">{status}</span>
        </p>
        {refused && (
          <p role="alert" data-testid="confirm-error" className="text-sm text-bad-600">
            {t('missingForConfirmation', { fields: refused.map(fieldLabel).join(', ') })}
          </p>
        )}
        {confirmState.error && !refused && (
          <p role="alert" data-testid="confirm-error" className="text-sm text-bad-600">
            {confirmState.error}
          </p>
        )}
        {!locked && missing.length > 0 && (
          <p data-testid="confirm-blocked" className="text-sm text-warn-700">
            {t('answersMissing', { fields: missing.map(fieldLabel).join(', ') })}
          </p>
        )}
        {!locked && (
          <button
            type="submit"
            disabled={confirming || missing.length > 0}
            className="staff-btn-ok"
          >
            {t('confirm')}
          </button>
        )}
      </form>
    </div>
  );
}
