'use client';

import { useLocale, useTranslations } from 'next-intl';
import { PackPreviewCard } from '../pack-preview';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';

/** Upload the Thai certificate first; the record is created and filled from it (decision D37). */
export function UploadFirstForm({ extractionAvailable }: { extractionAvailable: boolean }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const { state, pending, submit, inspect, preview } = useDirectUpload({
    locale,
    id: null,
    redirect: true,
  });
  const errorKey = UPLOAD_ERROR_KEYS.find((k) => k === state.error);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="staff-card grid max-w-2xl gap-3"
      data-testid="upload-first"
    >
      <h2 className="font-semibold">{t('uploadFirstTitle')}</h2>
      <p className="text-sm text-ink-700">
        {extractionAvailable ? t('uploadFirstHint') : t('uploadFirstNoExtraction')}
      </p>
      <input
        name="document"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        required
        data-testid="upload-first-file"
        onChange={(e) => void inspect([...(e.target.files ?? [])])}
        className="text-sm"
      />
      {preview && <PackPreviewCard preview={preview} />}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {errorKey ? t(`errors.${errorKey}`) : state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="upload-first-submit"
        className="staff-btn justify-self-start"
      >
        {pending ? t('uploadingAndReading') : t('uploadAndFill')}
      </button>
    </form>
  );
}
