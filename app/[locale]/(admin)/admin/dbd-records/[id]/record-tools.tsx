'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  confirmDbdRecordAction,
  extractDocumentAction,
  uploadDocumentAction,
  type ToolState,
} from '../actions';

const initial: ToolState = { ok: false, error: null };
const UPLOAD_ERROR_KEYS = ['no-file', 'invalid-file'] as const;
const EXTRACT_ERROR_KEYS = [
  'not_configured',
  'provider',
  'invalid_output',
  'no_document',
  'not_allowed',
] as const;

function FillOutcome({ state }: { state: ToolState }) {
  const t = useTranslations('admin.dbd');
  if (!state.ok) return null;
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === state.extractionError);
  if (state.extraction === 'filled') {
    return (
      <p role="status" data-testid="extract-status" className="text-sm text-green-700">
        {t('autoFilled', { count: state.applied?.length ?? 0 })}
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
  documentPath,
  extractionAvailable,
}: {
  id: string;
  status: string;
  documentPath: string | null;
  extractionAvailable: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [confirmState, confirmAction, confirming] = useActionState(confirmDbdRecordAction, initial);
  const [uploadState, uploadAction, uploading] = useActionState(uploadDocumentAction, initial);
  const [extractState, extractAction, extracting] = useActionState(extractDocumentAction, initial);
  const missing = confirmState.error?.startsWith('missing:')
    ? confirmState.error.slice('missing:'.length)
    : null;
  const uploadErrorKey = UPLOAD_ERROR_KEYS.find((k) => k === uploadState.error);
  const extractErrorKey = EXTRACT_ERROR_KEYS.find((k) => k === extractState.error);
  const canExtract = documentPath !== null && status !== 'confirmed' && extractionAvailable;

  return (
    <div className="grid max-w-2xl gap-4">
      <form action={uploadAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">{documentPath ? t('documentUploaded') : t('documentMissing')}</p>
        <p className="text-xs text-gray-600">
          {extractionAvailable ? t('uploadFillsHint') : t('extractionNotConfigured')}
        </p>
        <input name="document" type="file" accept="application/pdf" required className="text-sm" />
        {uploadState.error && (
          <p role="alert" className="text-sm text-red-700">
            {uploadErrorKey ? t(`errors.${uploadErrorKey}`) : uploadState.error}
          </p>
        )}
        <FillOutcome state={uploadState} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={uploading || status === 'confirmed'}
            className="rounded border px-4 py-2 disabled:opacity-50"
          >
            {uploading ? t('uploadingAndReading') : t('uploadAndFill')}
          </button>
          <button
            type="submit"
            formAction={extractAction}
            disabled={!canExtract || extracting || uploading}
            data-testid="extract-button"
            className="rounded border px-4 py-2 disabled:opacity-50"
            title={t('extractHint')}
          >
            {extracting ? t('extracting') : t('reExtract')}
          </button>
        </div>
        {extractState.error && (
          <p role="alert" data-testid="extract-error" className="text-sm text-red-700">
            {extractErrorKey ? t(`extractErrors.${extractErrorKey}`) : extractState.error}
          </p>
        )}
        <FillOutcome state={extractState} />
      </form>

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
        {status !== 'confirmed' && (
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
