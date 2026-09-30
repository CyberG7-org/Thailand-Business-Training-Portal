'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { BusinessCategoryRow } from '@/lib/db/business-categories';
import { createCategoryAction, updateCategoryAction, type CategoryFormState } from './actions';

const initial: CategoryFormState = { ok: false, error: null };

function Labels({ category }: { category?: BusinessCategoryRow }) {
  const t = useTranslations('admin.businessCategories');
  return (
    <>
      <label className="text-sm">
        {t('labelTh')}
        <input
          name="label_th"
          required
          defaultValue={category?.label_th ?? ''}
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('labelEn')}
        <input
          name="label_en"
          required
          defaultValue={category?.label_en ?? ''}
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('labelZh')}
        <input
          name="label_zh"
          required
          defaultValue={category?.label_zh ?? ''}
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('sortOrder')}
        <input
          name="sort_order"
          type="number"
          min={0}
          max={10000}
          defaultValue={category?.sort_order ?? 0}
          className="staff-input mt-1 tabular-nums"
        />
      </label>
    </>
  );
}

function Result({ state }: { state: CategoryFormState }) {
  const t = useTranslations('admin.businessCategories');
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-bad-600">
        {t(`errors.${state.error}` as 'errors.failed')}
      </p>
    );
  }
  return state.ok ? (
    <p role="status" className="text-sm text-ok-600">
      {t('saved')}
    </p>
  ) : null;
}

export function NewCategoryForm() {
  const locale = useLocale();
  const t = useTranslations('admin.businessCategories');
  const [state, action, pending] = useActionState(createCategoryAction, initial);
  return (
    <form action={action} className="staff-card grid max-w-2xl gap-3" data-testid="category-new">
      <input type="hidden" name="locale" value={locale} />
      <label className="text-sm">
        {t('key')}
        <input
          name="key"
          required
          pattern="[a-z][a-z0-9_]{1,59}"
          className="staff-input mt-1 font-mono"
        />
        <span className="block text-sm text-ink-500">{t('keyHint')}</span>
      </label>
      <Labels />
      <Result state={state} />
      <button
        type="submit"
        disabled={pending}
        className="staff-btn justify-self-start"
        data-testid="category-add"
      >
        {t('add')}
      </button>
    </form>
  );
}

export function CategoryRowForm({ category }: { category: BusinessCategoryRow }) {
  const locale = useLocale();
  const t = useTranslations('admin.businessCategories');
  const [state, action, pending] = useActionState(updateCategoryAction, initial);
  return (
    <form
      action={action}
      className="staff-card grid gap-3 md:grid-cols-2"
      data-testid={`category-${category.key}`}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="key" value={category.key} />
      <p className="font-mono text-sm md:col-span-2">{category.key}</p>
      <Labels category={category} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={category.active} className="size-5" />
        {t('active')}
      </label>
      <div className="grid gap-1 md:col-span-2">
        <Result state={state} />
        <button type="submit" disabled={pending} className="staff-btn-ghost justify-self-start">
          {t('save')}
        </button>
      </div>
    </form>
  );
}
