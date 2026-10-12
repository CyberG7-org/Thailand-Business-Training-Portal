'use client';

import { useActionState, useEffect } from 'react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uploadCompanyImageAction, type ImageUploadState } from './image-actions';
import { PackPreviewCard } from '../pack-preview';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';

const initial: ImageUploadState = { error: null, recordId: null };

export function UploadFirstForm({
  extractionAvailable,
  zipExtractionAvailable,
  embedded = false,
}: {
  extractionAvailable: boolean;
  zipExtractionAvailable: boolean;
  embedded?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const router = useRouter();
  const [mode, setMode] = useState<'image' | 'zip'>('image');
  const [state, action, pending] = useActionState(uploadCompanyImageAction, initial);
  const zip = useDirectUpload({ locale, id: null, redirect: true });
  const zipError = UPLOAD_ERROR_KEYS.find((key) => key === zip.state.error);
  useEffect(() => {
    if (state.recordId) router.push(`/admin/dbd-records/${state.recordId}`);
  }, [router, state.recordId]);
  const formClass = `grid gap-3 ${embedded ? 'max-w-3xl' : 'staff-card max-w-2xl'}`;
  return (
    <div
      id={embedded ? 'create-dbd' : undefined}
      className="grid gap-4"
      data-testid={embedded ? 'create-dbd' : 'upload-choice'}
    >
      <fieldset className="grid gap-2 text-sm">
        <legend className="font-semibold text-ink-900">Choose how to add the company</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="uploadMode"
              value="image"
              checked={mode === 'image'}
              onChange={() => setMode('image')}
            />{' '}
            Image
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="uploadMode"
              value="zip"
              checked={mode === 'zip'}
              onChange={() => setMode('zip')}
            />{' '}
            ZIP file
          </label>
        </div>
      </fieldset>
      {mode === 'image' ? (
        <form action={action} className={formClass} data-testid="upload-first">
          <input type="hidden" name="locale" value={locale} />
          <h2 className="font-semibold">Upload company information image</h2>
          <p className="text-sm text-ink-700">
            Upload one image showing the registration and business details. Review every extracted
            fact on the next screen; this image is not an official DBD certificate.
          </p>
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            data-testid={embedded ? 'create-dbd-files' : 'upload-first-file'}
            className="text-sm"
          />
          <p className="text-xs text-ink-500">
            JPG, PNG or WebP, up to 4 MB. Revenue and transaction figures come from the category you
            choose after upload.
          </p>
          {!extractionAvailable && (
            <p role="alert" className="text-sm text-bad-600">
              Image reading needs GEMINI_API_KEY on the server.
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-bad-600">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !extractionAvailable}
            data-testid={embedded ? 'create-dbd-submit' : 'upload-first-submit'}
            className="staff-btn justify-self-start"
          >
            {pending ? 'Reading image…' : 'Upload and review'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            zip.submit(event.currentTarget);
          }}
          className={formClass}
          data-testid="upload-zip"
        >
          <h2 className="font-semibold">Upload company ZIP file</h2>
          <p className="text-sm text-ink-700">
            Include the DBD PDFs and a website or Facebook link file. The links will be prefilled in
            Company details after upload.
          </p>
          <input
            name="document"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            required
            className="text-sm"
            data-testid={embedded ? 'create-dbd-zip-files' : 'upload-zip-file'}
            onChange={(event) => void zip.inspect([...(event.target.files ?? [])])}
          />
          {zip.preview && <PackPreviewCard preview={zip.preview} />}
          {!zipExtractionAvailable && (
            <p className="text-sm text-ink-700">
              ZIP reading is not configured. You can upload it, but its PDFs will not be extracted
              automatically.
            </p>
          )}
          {zip.state.error && (
            <p role="alert" className="text-sm text-bad-600">
              {zipError ? t(`errors.${zipError}`) : zip.state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={zip.pending}
            className="staff-btn justify-self-start"
            data-testid={embedded ? 'create-dbd-zip-submit' : 'upload-zip-submit'}
          >
            {zip.pending ? 'Uploading ZIP…' : 'Upload ZIP and review'}
          </button>
        </form>
      )}
    </div>
  );
}
