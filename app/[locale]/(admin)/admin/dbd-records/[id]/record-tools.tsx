'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
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

function FillOutcome({ state }: { state: ToolState }) {
  const t = useTranslations('admin.dbd');
  if (!state.ok) return null;
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === state.extractionError);
  const background = state.transcripts && (
    <p role="status" data-testid="transcripts-note" className="text-sm text-gray-700">
      {t(state.transcripts === 'queued' ? 'queuedFill' : 'deferredFill')}
    </p>
  );
  if (state.extraction === 'filled') {
    return (
      <>
        <p role="status" data-testid="extract-status" className="text-sm text-green-700">
          {t('autoFilled', { count: state.applied?.length ?? 0 })}
        </p>
        {background}
      </>
    );
  }
  if (state.extraction === 'deferred' || state.extraction === 'queued') {
    return (
      <p role="status" data-testid="extract-status" className="text-sm text-gray-700">
        {t(state.extraction === 'queued' ? 'queuedFill' : 'deferredFill')}
      </p>
    );
  }
  if (state.extraction === 'failed') {
    return (
      <p role="alert" data-testid="extract-error" className="text-sm text-amber-700">
        {t('uploadedButNotRead', {
          reason: extractErrorKey
            ? t(`extractErrors.${extractErrorKey}`)
            : (state.extractionError ?? ''),
        })}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-green-700">
      {t('uploaded')}
    </p>
  );
}

export function RecordTools({
  id,
  status,
  documents,
  extractionAvailable,
}: {
  id: string;
  status: string;
  documents: DocumentSummary[];
  extractionAvailable: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [confirmState, confirmAction, confirming] = useActionState(confirmDbdRecordAction, initial);
  const {
    state: uploadState,
    pending: uploading,
    submit: submitUpload,
  } = useDirectUpload({ locale, id, redirect: false });
  const [extractState, extractAction, extracting] = useActionState(extractDocumentAction, initial);
  const missing = confirmState.error?.startsWith('missing:')
    ? confirmState.error.slice('missing:'.length)
    : null;
  const uploadErrorKey = UPLOAD_ERROR_KEYS.find((k) => k === uploadState.error);
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === extractState.error);
  const locked = status === 'confirmed';
  const canExtract = documents.length > 0 && !locked && extractionAvailable;
  const typeLabel = (type: string | null) =>
    type ? t(`documentTypes.${type}` as 'documentTypes.certificate') : t('documentTypes.unknown');

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-3 rounded border p-4">
        <p className="text-sm font-semibold">{t('documents')}</p>
        {documents.length === 0 ? (
          <p className="text-sm">{t('documentMissing')}</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="document-list">
            {documents.map((doc, i) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2">
                <span className="text-gray-500">{i + 1}.</span>
                <span>{doc.name}</span>
                <span className="rounded bg-gray-100 px-1 text-xs" data-testid="document-type">
                  {typeLabel(doc.type)}
                </span>
                <span className="text-xs text-gray-500">
                  {(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB
                </span>
                <span
                  data-testid="index-status"
                  data-status={doc.indexStatus}
                  title={doc.indexError ?? undefined}
                  className={`rounded px-1 text-xs ${
                    doc.indexStatus === 'ready'
                      ? 'bg-green-100'
                      : doc.indexStatus === 'failed'
                        ? 'bg-red-100'
                        : 'bg-gray-100'
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
                      className="text-xs underline"
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
                    <button type="submit" className="text-xs text-red-700 underline">
                      {t('removeDocument')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {documents.length > 0 && <p className="text-xs text-gray-600">{t('index.hint')}</p>}

        <div className="grid gap-2 border-t pt-3">
          <p className="text-xs text-gray-600">
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
              <p role="alert" className="text-sm text-red-700">
                {uploadErrorKey ? t(`errors.${uploadErrorKey}`) : uploadState.error}
              </p>
            )}
            <FillOutcome state={uploadState} />
            <button
              type="submit"
              disabled={uploading || locked}
              className="justify-self-start rounded border px-4 py-2 disabled:opacity-50"
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
              className="justify-self-start rounded border px-4 py-2 disabled:opacity-50"
              title={t('extractHint')}
            >
              {extracting ? t('extracting') : t('reExtract')}
            </button>
            {extractState.error && (
              <p role="alert" data-testid="extract-error" className="text-sm text-red-700">
                {extractErrorKey ? t(`extractErrors.${extractErrorKey}`) : extractState.error}
              </p>
            )}
            <FillOutcome state={extractState} />
          </form>
        </div>
      </div>

      <form action={confirmAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">
          {t('status')}: <span data-testid="record-status">{status}</span>
        </p>
        {missing && (
          <p role="alert" data-testid="confirm-error" className="text-sm text-red-700">
            {t('missingForConfirmation', { fields: missing })}
          </p>
        )}
        {confirmState.error && !missing && (
          <p role="alert" data-testid="confirm-error" className="text-sm text-red-700">
            {confirmState.error}
          </p>
        )}
        {!locked && (
          <button
            type="submit"
            disabled={confirming}
            className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {t('confirm')}
          </button>
        )}
      </form>
    </div>
  );
}
