'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createFromDocumentAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };
const ERROR_KEYS = ['no-file', 'invalid-file'] as const;

/** Upload the Thai certificate first; the record is created and filled from it (decision D37). */
export function UploadFirstForm({ extractionAvailable }: { extractionAvailable: boolean }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(createFromDocumentAction, initial);
  const errorKey = ERROR_KEYS.find((k) => k === state.error);
  return (
    <form
      action={formAction}
      className="grid max-w-2xl gap-3 rounded border border-gray-900 p-4"
      data-testid="upload-first"
    >
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold">{t('uploadFirstTitle')}</h2>
      <p className="text-sm text-gray-700">
        {extractionAvailable ? t('uploadFirstHint') : t('uploadFirstNoExtraction')}
      </p>
      <input
        name="document"
        type="file"
        accept="application/pdf"
        required
        data-testid="upload-first-file"
        className="text-sm"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {errorKey ? t(`errors.${errorKey}`) : state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="upload-first-submit"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? t('uploadingAndReading') : t('uploadAndFill')}
      </button>
    </form>
  );
}
