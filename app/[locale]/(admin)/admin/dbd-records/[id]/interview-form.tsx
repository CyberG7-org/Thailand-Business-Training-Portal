'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { LEGACY_INTERVIEW_FIELDS, type InterviewProfile } from '@/lib/domain/bank-interview';
import {
  STANDARD_ANSWER_FIELDS,
  type AskedInterviewField,
  type StandardAnswerField,
} from '@/lib/domain/standard-answers';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

/** The questions still asked (D91), grouped as the bank groups them. */
const GROUPS: { key: 'money'; fields: AskedInterviewField[] }[] = [
  { key: 'money', fields: ['monthly_revenue', 'average_transaction'] },
];

/**
 * Level 4 — what the bank asks that no DBD document answers (D39, spec §5.4). A manager writes
 * five answers (D91); the rest are standard answers, shown read-only so the manager sees what
 * the learner is taught. Editable after confirmation: these are the company's prepared answers,
 * not certificate facts. The contact details and what the business does live in the Level 1
 * card.
 */
export function InterviewForm({
  recordId,
  answers,
  standard,
}: {
  recordId: string;
  answers: InterviewProfile;
  /** The standard answers as the fact sheet reads them (`withStandardAnswers`). */
  standard: Record<StandardAnswerField, string | null>;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveInterviewAnswersAction, initial);
  const section = 'grid gap-4 p-4 md:grid-cols-2 md:px-6 md:py-5';
  const heading = 'text-base font-semibold text-ink-900 md:col-span-2';

  return (
    <form
      action={formAction}
      className="staff-card grid divide-y divide-ink-100 p-0 md:p-0"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <div className="grid gap-1 p-4 md:px-6 md:py-5">
        <h2 className="text-base font-semibold text-ink-900">{t('levels.interview')}</h2>
        <p className="text-sm text-ink-500">{t('interviewHint')}</p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.key} className={section}>
          <h3 className={heading}>
            {t(`interviewGroups.${group.key}` as 'interviewGroups.customers')}
          </h3>
          {group.fields.map((field) => (
            <label key={field} className="text-sm">
              <span data-testid={`label-${field}`} className="font-semibold text-ink-900">
                {t(`interviewFields.${field}` as 'interviewFields.client_origin')}
              </span>
              {/* Each box grows with its answer, so a long one reads whole without a scrollbar;
                  an amount is one line. */}
              <textarea
                name={`interview_${field}`}
                rows={2}
                defaultValue={answers[field] ?? ''}
                className={`staff-input mt-1 field-sizing-content ${
                  group.key === 'money' ? 'min-h-11' : ''
                }`}
              />
            </label>
          ))}
          {group.key === 'money' && (
            <p className="text-sm text-ink-500 md:col-span-2">{t('amountHint')}</p>
          )}
        </section>
      ))}

      <details className="p-4 md:px-6" data-testid="legacy-answers">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-ink-700">
          {t('interviewGroups.legacy')}
        </summary>
        <p className="text-sm text-ink-500">{t('legacyHint')}</p>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          {LEGACY_INTERVIEW_FIELDS.map((field) => (
            <label key={field} className="text-sm">
              {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
              <input
                name={`interview_${field}`}
                defaultValue={answers[field] ?? ''}
                className="staff-input mt-1"
              />
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-end gap-3 p-4 md:px-6">
        {state.error && (
          <p role="alert" className="mr-auto text-sm text-bad-600">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" data-testid="interview-saved" className="mr-auto text-sm text-ok-600">
            {t('saved')}
          </p>
        )}
        <button type="submit" disabled={pending} data-testid="save-interview" className="staff-btn">
          {t('saveInterview')}
        </button>
      </div>

      <section className="grid gap-3 p-4 md:px-6 md:py-5" data-testid="standard-answers">
        <div>
          <h3 className="text-base font-semibold text-ink-900">{t('standardAnswers.title')}</h3>
          <p className="text-sm text-ink-500">{t('standardAnswers.hint')}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {STANDARD_ANSWER_FIELDS.map((field) => (
            <div key={field} className="grid gap-0.5 md:contents">
              <dt className="text-ink-500">
                {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
              </dt>
              <dd data-testid={`standard-${field}`} className="text-ink-900">
                {standard[field] ?? (
                  <span className="text-ink-500">{t('standardAnswers.pending')}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </form>
  );
}
