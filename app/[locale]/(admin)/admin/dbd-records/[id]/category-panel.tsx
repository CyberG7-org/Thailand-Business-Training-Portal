'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { CategoryAssignment } from '@/lib/domain/business-category';
import { remapBusinessCategoryAction, setBusinessCategoryAction, type ToolState } from '../actions';

export type CategoryOptionView = { key: string; label: string };

const initial: ToolState = { ok: false, error: null };
const KNOWN_ERRORS = ['no_text', 'not_configured', 'no_categories'] as const;

/**
 * The record's business category (spec §5.3): what was chosen and how, or the suggestion that
 * needs a person. Choosing holds until the business text changes; "map again" starts over.
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
  const [remapState, remapAction, remapping] = useActionState(remapBusinessCategoryAction, initial);
  const label = (key: string | null) => options.find((o) => o.key === key)?.label ?? key ?? '—';
  const pct = assignment?.confidence != null ? Math.round(assignment.confidence * 100) : 0;
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
        <p className="staff-notice-ok" data-testid="category-current">
          {label(assignment.key)} —{' '}
          {assignment.source === 'manual' ? t('manual') : t('auto', { confidence: pct })}
        </p>
      )}
      {status === 'needs_review' && assignment && (
        <p className="staff-notice-warn" data-testid="category-review">
          {t('needsReview', { candidate: label(assignment.candidate_key), confidence: pct })}
        </p>
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
            name="categoryKey"
            required
            defaultValue={assignment?.key ?? assignment?.candidate_key ?? ''}
            className="staff-input"
          >
            <option value="">{t('none')}</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={setting} className="staff-btn" data-testid="category-set">
          {t('set')}
        </button>
      </form>
      <form action={remapAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={recordId} />
        <button
          type="submit"
          disabled={remapping}
          className="staff-btn-ghost"
          data-testid="category-remap"
        >
          {t('remap')}
        </button>
      </form>
      {(setState.error || remapState.error) && (
        <p role="alert" className="text-sm text-bad-600">
          {setState.error ?? remapState.error}
        </p>
      )}
    </section>
  );
}
