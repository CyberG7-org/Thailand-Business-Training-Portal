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
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={material?.id ?? ''} />
      <label className="text-sm">
        {t('key')}
        <input
          name="contentKey"
          defaultValue={material?.content_key ?? ''}
          readOnly={material !== null}
          required
          className="mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100"
        />
        <span className="text-xs text-gray-500">{t('keyHint')}</span>
      </label>
      <label className="text-sm">
        {t('type')}
        <select
          name="type"
          defaultValue={material?.type ?? 'card'}
          className="mt-1 w-full rounded border px-2 py-1"
        >
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
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="active" type="checkbox" defaultChecked={material?.active ?? true} />
        {t('active')}
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('save')}
      </button>
    </form>
  );
}
