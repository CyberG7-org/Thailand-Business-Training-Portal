'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { CategoryAssignment } from '@/lib/domain/business-category';
import { setBusinessCategoryAction, type ToolState } from '../actions';

export type CategoryOptionView = { key: string; label: string };

const initial: ToolState = { ok: false, error: null };
const KNOWN_ERRORS = ['no_text', 'not_configured', 'no_categories', 'choose-category'] as const;

/**
 * The record's business category (spec §5.3, D90): the mapper's best match, or a person's own
 * choice, which determines the three interview figures.
 */
export function CategoryPanel({
  recordId,
  assignment,
  options,
}: {
  recordId: string;
  assignment: CategoryAssignment | null;
  options: CategoryOptionView[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.category');
  const [setState, setAction, setting] = useActionState(setBusinessCategoryAction, initial);
  const label = (key: string | null) => options.find((o) => o.key === key)?.label ?? key ?? '—';
  const sortedOptions = [...options].sort(
    (a, b) =>
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) || a.key.localeCompare(b.key),
  );
  const status = assignment?.status ?? 'unmapped';
  const reason = assignment?.error;
  const reasonKey = (KNOWN_ERRORS as readonly string[]).includes(reason ?? '')
    ? (`errors.${reason}` as 'errors.no_text')
    : ('errors.failed' as const);

  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="category-panel"
      data-status={status}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      {status === 'mapped' && assignment && (
        <div
          className={assignment.method === 'fallback' ? 'staff-notice-info' : 'staff-notice-ok'}
          data-testid="category-current"
        >
          <p>
            {label(assignment.key)} —{' '}
            {assignment.source === 'manual'
              ? t('manual')
              : assignment.method === 'fallback'
                ? t('fallback')
                : t('auto')}
          </p>
          {assignment.method === 'fallback' && <p>{t('fallbackReason')}</p>}
          {assignment.source === 'auto' &&
          assignment.method !== 'fallback' &&
          assignment.matched_evidence?.length ? (
            <p className="mt-1 text-xs">
              {t('evidence')}:{' '}
              {assignment.matched_evidence
                .filter((hit) => hit.categoryKey === assignment.key)
                .map((hit) => `${hit.phrase} (${hit.sourceField})`)
                .join(', ')}
            </p>
          ) : null}
        </div>
      )}
      {status === 'unmapped' && (
        <p className="staff-notice-info" data-testid="category-unmapped">
          {reason ? t(reasonKey) : t('unmapped')}
        </p>
      )}
      <form action={setAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={recordId} />
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          {t('choose')}
          <select
            key={assignment?.key ?? 'none'}
            name="categoryKey"
            required
            defaultValue={assignment?.key ?? ''}
            className="staff-input"
          >
            <option value="">{t('none')}</option>
            {sortedOptions.map((o, index) => (
              <option
                key={o.key}
                value={o.key}
                style={
                  o.key === assignment?.key
                    ? { backgroundColor: '#e5e7eb', color: '#111827' }
                    : undefined
                }
              >
                {String(index + 1).padStart(2, '0')}. {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={setting} className="staff-btn" data-testid="category-set">
          {t('set')}
        </button>
      </form>
      {setState.error && (
        <p role="alert" className="text-sm text-bad-600">
          {setState.error}
        </p>
      )}
    </section>
  );
}
