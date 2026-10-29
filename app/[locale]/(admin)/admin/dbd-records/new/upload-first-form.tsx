'use client';

import { useActionState, useEffect } from 'react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  uploadCompanyImageAction,
  uploadCompanyPdfAction,
  type ImageUploadState,
} from './image-actions';
import { PackPreviewCard } from '../pack-preview';
import { UPLOAD_ERROR_KEYS, useDirectUpload } from '../use-direct-upload';

const initial: ImageUploadState = { error: null, recordId: null };

export function UploadFirstForm({
  extractionAvailable,
  pdfExtractionAvailable,
  zipExtractionAvailable,
  embedded = false,
}: {
  extractionAvailable: boolean;
  pdfExtractionAvailable: boolean;
  zipExtractionAvailable: boolean;
  embedded?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const u = useTranslations('admin.dbd.uploadChoice');
  const router = useRouter();
  const [mode, setMode] = useState<'image' | 'pdf' | 'zip'>('image');
  const [imageName, setImageName] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);
  const [state, action, pending] = useActionState(uploadCompanyImageAction, initial);
  const [pdfState, pdfAction, pdfPending] = useActionState(uploadCompanyPdfAction, initial);
  const zip = useDirectUpload({ locale, id: null, redirect: true });
  const zipError = UPLOAD_ERROR_KEYS.find((key) => key === zip.state.error);
  const errorText = (error: string) =>
    error === 'manager-action-needed' ? t('errors.manager-action-needed') : error;
  useEffect(() => {
    if (state.recordId) {
      router.push(state.redirectTo ?? `/admin/dbd-records/${state.recordId}`);
      router.refresh();
    }
  }, [router, state.recordId, state.redirectTo]);
  useEffect(() => {
    if (pdfState.recordId) {
      router.push(pdfState.redirectTo ?? `/admin/dbd-records/${pdfState.recordId}`);
      router.refresh();
    }
  }, [router, pdfState.recordId, pdfState.redirectTo]);
  const formClass = `grid gap-4 ${embedded ? '' : 'staff-card max-w-2xl'}`;
  return (
    <div
      id={embedded ? 'create-dbd' : undefined}
      className="grid gap-4"
      data-testid={embedded ? 'create-dbd' : 'upload-choice'}
    >
      <fieldset className="grid gap-3 text-sm">
        <legend className="font-semibold text-ink-900">{u('chooseWhat')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label
            className={`flex min-h-24 cursor-pointer items-center gap-4 rounded-card border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 ${mode === 'image' ? 'border-brand-600 bg-brand-50' : 'border-ink-100 bg-white hover:border-brand-100'}`}
          >
            <input
              type="radio"
              name="uploadMode"
              value="image"
              checked={mode === 'image'}
              onChange={() => setMode('image')}
              className="accent-brand-600"
            />
            <span className="grid gap-1">
              <span className="text-base font-semibold text-ink-900">{u('image')}</span>
              <span className="text-xs text-ink-700">{u('imageHint')}</span>
            </span>
          </label>
          <label
            className={`flex min-h-24 cursor-pointer items-center gap-4 rounded-card border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 ${mode === 'pdf' ? 'border-brand-600 bg-brand-50' : 'border-ink-100 bg-white hover:border-brand-100'}`}
          >
            <input
              type="radio"
              name="uploadMode"
              value="pdf"
              checked={mode === 'pdf'}
              onChange={() => setMode('pdf')}
              className="accent-brand-600"
            />
            <span className="grid gap-1">
              <span className="text-base font-semibold text-ink-900">{u('pdfPoster')}</span>
              <span className="text-xs text-ink-700">{u('pdfHint')}</span>
            </span>
          </label>
          <label
            className={`flex min-h-24 cursor-pointer items-center gap-4 rounded-card border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 ${mode === 'zip' ? 'border-brand-600 bg-brand-50' : 'border-ink-100 bg-white hover:border-brand-100'}`}
          >
            <input
              type="radio"
              name="uploadMode"
              value="zip"
              checked={mode === 'zip'}
              onChange={() => setMode('zip')}
              className="accent-brand-600"
            />
            <span className="grid gap-1">
              <span className="text-base font-semibold text-ink-900">{u('zipFile')}</span>
              <span className="text-xs text-ink-700">{u('zipHint')}</span>
            </span>
          </label>
        </div>
      </fieldset>
      {mode === 'image' ? (
        <form action={action} className={formClass} data-testid="upload-first">
          <input type="hidden" name="locale" value={locale} />
          <h2 className="font-semibold">{u('imageTitle')}</h2>
          <p className="text-sm text-ink-700">{u('imageDescription')}</p>
          <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-brand-600/50 bg-brand-50 px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 hover:bg-brand-100">
            <span className="text-base font-semibold text-brand-700">
              {imageName ?? u('chooseImage')}
            </span>
            <span className="text-xs text-ink-700">{u('browse')}</span>
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              data-testid={embedded ? 'create-dbd-files' : 'upload-first-file'}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(event) => setImageName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
          <p className="text-xs text-ink-500">{u('imageLimits')}</p>
          {!extractionAvailable && (
            <p role="alert" className="text-sm text-bad-600">
              {u('imageUnavailable')}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-bad-600">
              {errorText(state.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !extractionAvailable}
            data-testid={embedded ? 'create-dbd-submit' : 'upload-first-submit'}
            className="staff-btn justify-self-start"
          >
            {pending ? u('readingImage') : u('uploadReview')}
          </button>
        </form>
      ) : mode === 'pdf' ? (
        <form action={pdfAction} className={formClass} data-testid="upload-pdf">
          <input type="hidden" name="locale" value={locale} />
          <h2 className="font-semibold">{u('pdfTitle')}</h2>
          <p className="text-sm text-ink-700">{u('pdfDescription')}</p>
          <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-brand-600/50 bg-brand-50 px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 hover:bg-brand-100">
            <span className="text-base font-semibold text-brand-700">
              {pdfName ?? u('choosePdf')}
            </span>
            <span className="text-xs text-ink-700">{u('browse')}</span>
            <input
              name="pdf"
              type="file"
              accept=".pdf,application/pdf"
              required
              data-testid={embedded ? 'create-dbd-pdf-files' : 'upload-pdf-file'}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(event) => setPdfName(event.target.files?.[0]?.name ?? null)}
            />
          </label>
          <p className="text-xs text-ink-500">{u('pdfLimits')}</p>
          {!pdfExtractionAvailable && (
            <p role="alert" className="text-sm text-bad-600">
              {u('pdfUnavailable')}
            </p>
          )}
          {pdfState.error && (
            <p role="alert" className="text-sm text-bad-600">
              {errorText(pdfState.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={pdfPending || !pdfExtractionAvailable}
            data-testid={embedded ? 'create-dbd-pdf-submit' : 'upload-pdf-submit'}
            className="staff-btn justify-self-start"
          >
            {pdfPending ? u('readingPdf') : u('uploadPdfReview')}
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
          <h2 className="font-semibold">{u('zipTitle')}</h2>
          <p className="text-sm text-ink-700">{u('zipDescription')}</p>
          <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-brand-600/50 bg-brand-50 px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-brand-600 focus-within:ring-offset-2 hover:bg-brand-100">
            <span className="text-base font-semibold text-brand-700">
              {zipName ?? u('chooseZip')}
            </span>
            <span className="text-xs text-ink-700">{u('browse')}</span>
            <input
              name="document"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              required
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              data-testid={embedded ? 'create-dbd-zip-files' : 'upload-zip-file'}
              onChange={(event) => {
                setZipName(event.target.files?.[0]?.name ?? null);
                void zip.inspect([...(event.target.files ?? [])]);
              }}
            />
          </label>
          {zip.preview && <PackPreviewCard preview={zip.preview} />}
          {!zipExtractionAvailable && <p className="text-sm text-ink-700">{u('zipUnavailable')}</p>}
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
            {zip.pending ? u('uploadingZip') : u('uploadZipReview')}
          </button>
        </form>
      )}
    </div>
  );
}
