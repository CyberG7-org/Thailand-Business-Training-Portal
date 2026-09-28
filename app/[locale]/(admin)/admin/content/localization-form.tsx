'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { AppLocale } from '@/i18n/routing';
import type { StudyLocalizationRow } from '@/lib/db/study';
import { saveLocalizationAction, uploadStudyPdfAction, type ContentState } from './actions';

const initial: ContentState = { ok: false, error: null };
const LANGUAGE_LABELS: Record<AppLocale, string> = { th: 'ไทย', en: 'English', zh: '中文' };

export function LocalizationForm({
  materialId,
  materialType,
  language,
  localization,
}: {
  materialId: string;
  materialType: 'card' | 'pdf';
  language: AppLocale;
  localization: StudyLocalizationRow | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.content');
  const [state, formAction, pending] = useActionState(saveLocalizationAction, initial);
  const [uploadState, uploadAction, uploading] = useActionState(uploadStudyPdfAction, initial);
  return (
    <div className="staff-card grid gap-3" data-testid={`localization-${language}`}>
      <h3 className="font-semibold">
        {LANGUAGE_LABELS[language]}
        {localization ? '' : ` — ${t('missing')}`}
      </h3>
      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="materialId" value={materialId} />
        <input type="hidden" name="language" value={language} />
        <label className="text-sm">
          {t('materialTitle')}
          <input
            name="title"
            defaultValue={localization?.title ?? ''}
            required
            className="staff-input mt-1"
          />
        </label>
        {materialType === 'card' && (
          <label className="text-sm">
            {t('body')}
            <textarea
              name="body"
              rows={10}
              defaultValue={localization?.body ?? ''}
              className="staff-input mt-1 font-mono text-sm"
            />
            <span className="text-xs text-ink-500">{t('bodyHint')}</span>
          </label>
        )}
        {language === 'th' && materialType === 'card' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              name="ttsEnabled"
              type="checkbox"
              defaultChecked={localization?.tts_enabled ?? false}
            />
            {t('ttsEnabled')}
          </label>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-bad-600">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm text-ok-600">
            {t('saved')}
          </p>
        )}
        <button type="submit" disabled={pending} className="staff-btn">
          {t('saveLanguage')}
        </button>
      </form>
      {materialType === 'pdf' && localization && (
        <form action={uploadAction} className="grid gap-2 border-t pt-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="materialId" value={materialId} />
          <input type="hidden" name="language" value={language} />
          <p className="text-sm">{localization.file_path ? t('pdfUploaded') : t('pdfMissing')}</p>
          <input
            name="document"
            type="file"
            accept="application/pdf"
            required
            className="text-sm"
          />
          {uploadState.error && (
            <p role="alert" className="text-sm text-bad-600">
              {uploadState.error}
            </p>
          )}
          {uploadState.ok && (
            <p role="status" className="text-sm text-ok-600">
              {t('uploaded')}
            </p>
          )}
          <button type="submit" disabled={uploading} className="staff-btn-ghost">
            {t('uploadPdf')}
          </button>
        </form>
      )}
    </div>
  );
}
