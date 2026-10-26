'use client';

import { useTranslations } from 'next-intl';

type LearnerOption = { id: string; label: string; ready: boolean; reason: string };

/** A learner selection navigates straight to their calendar; no second submit is needed. */
export function LearnerPicker({
  selectedId,
  month,
  options,
}: {
  selectedId: string;
  month: string;
  options: LearnerOption[];
}) {
  const t = useTranslations('admin.appointments');
  return (
    <form method="get">
      <label className="grid gap-1 text-sm font-medium text-ink-900">
        {t('chooseLearner')}
        <select
          name="learner"
          data-testid="appointment-learner"
          defaultValue={selectedId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="staff-input"
        >
          <option value="">{t('choose')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={!option.ready}>
              {option.label}
              {!option.ready ? ` · ${option.reason}` : ''}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="month" value={month} />
    </form>
  );
}
