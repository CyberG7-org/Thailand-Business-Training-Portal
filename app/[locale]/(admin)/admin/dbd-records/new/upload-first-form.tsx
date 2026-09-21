'use client';

import { useLocale, useTranslations } from 'next-intl';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';

/** Upload the Thai certificate first; the record is created and filled from it (decision D37). */
export function UploadFirstForm({ extractionAvailable }: { extractionAvailable: boolean }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const { state, pending, submit } = useDirectUpload({ locale, id: null, redirect: true });
  const errorKey = UPLOAD_ERROR_KEYS.find((k) => k === state.error);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="grid max-w-2xl gap-3 rounded border border-gray-900 p-4"
      data-testid="upload-first"
    >
      <h2 className="font-semibold">{t('uploadFirstTitle')}</h2>
      <p className="text-sm text-gray-700">
        {extractionAvailable ? t('uploadFirstHint') : t('uploadFirstNoExtraction')}
      </p>
      <input
        name="document"
        type="file"
        accept="application/pdf"
        multiple
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
