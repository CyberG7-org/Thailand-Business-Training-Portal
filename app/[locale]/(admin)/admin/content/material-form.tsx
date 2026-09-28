'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { StudyMaterialRow } from '@/lib/db/study';
import { saveMaterialAction, type ContentState } from './actions';

const initial: ContentState = { ok: false, error: null };

export function MaterialForm({ material }: { material: StudyMaterialRow | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.content');
  const [state, formAction, pending] = useActionState(saveMaterialAction, initial);
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={material?.id ?? ''} />
      <label className="text-sm">
        {t('key')}
        <input
          name="contentKey"
          defaultValue={material?.content_key ?? ''}
          readOnly={material !== null}
          required
          className="staff-input mt-1"
        />
        <span className="text-xs text-ink-500">{t('keyHint')}</span>
      </label>
      <label className="text-sm">
        {t('type')}
        <select name="type" defaultValue={material?.type ?? 'card'} className="staff-input mt-1">
          <option value="card">{t('typeCard')}</option>
          <option value="pdf">{t('typePdf')}</option>
        </select>
      </label>
      <label className="text-sm">
        {t('sortOrder')}
        <input
          name="sortOrder"
          type="number"
          defaultValue={material?.sort_order ?? 0}
          className="staff-input mt-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="active" type="checkbox" defaultChecked={material?.active ?? true} />
        {t('active')}
      </label>
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
        {t('save')}
      </button>
    </form>
  );
}
