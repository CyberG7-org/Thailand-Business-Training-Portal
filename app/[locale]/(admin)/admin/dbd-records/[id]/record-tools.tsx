'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { confirmDbdRecordAction, uploadDocumentAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };
const UPLOAD_ERROR_KEYS = ['no-file', 'invalid-file'] as const;

export function RecordTools({
  id,
  status,
  documentPath,
}: {
  id: string;
  status: string;
  documentPath: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [confirmState, confirmAction, confirming] = useActionState(confirmDbdRecordAction, initial);
  const [uploadState, uploadAction, uploading] = useActionState(uploadDocumentAction, initial);
  const missing = confirmState.error?.startsWith('missing:')
    ? confirmState.error.slice('missing:'.length)
    : null;
  const uploadErrorKey = UPLOAD_ERROR_KEYS.find((k) => k === uploadState.error);
  return (
    <div className="grid max-w-2xl gap-4">
      <form action={uploadAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">{documentPath ? t('documentUploaded') : t('documentMissing')}</p>
        <input name="document" type="file" accept="application/pdf" required className="text-sm" />
        {uploadState.error && (
          <p role="alert" className="text-sm text-red-700">
            {uploadErrorKey ? t(`errors.${uploadErrorKey}`) : uploadState.error}
          </p>
        )}
        {uploadState.ok && (
          <p role="status" className="text-sm text-green-700">
            {t('uploaded')}
          </p>
        )}
        <button
          type="submit"
          disabled={uploading}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          {t('upload')}
        </button>
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
