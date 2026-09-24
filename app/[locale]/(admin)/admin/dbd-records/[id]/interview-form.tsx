'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CONTACT_FIELDS,
  INTERVIEW_FIELDS,
  REQUIRED_INTERVIEW_FIELDS,
  missingBusinessAnswers,
  type InterviewProfile,
} from '@/lib/domain/bank-interview';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

const BUSINESS_FIELDS = ['nature_of_business', 'products_services'] as const;
const OTHER_FIELDS = INTERVIEW_FIELDS.filter(
  (f) =>
    !(CONTACT_FIELDS as readonly string[]).includes(f) &&
    !(BUSINESS_FIELDS as readonly string[]).includes(f),
);

/** Three groups: how to reach the company, what it does, and the bank's remaining questions. */
const GROUPS = [
  { heading: 'interviewGroups.contact', fields: [...CONTACT_FIELDS] },
  { heading: 'interviewGroups.business', fields: [...BUSINESS_FIELDS] },
  { heading: 'interviewGroups.bank', fields: OTHER_FIELDS },
] as const;

/**
 * Level 4 — the bank's interview answers the DBD documents cannot supply (decision D39).
 * Independent of the DBD form and editable even after confirmation: these are the company's
 * prepared answers, not certificate facts.
 */
export function InterviewForm({
  recordId,
  answers,
}: {
  recordId: string;
  answers: InterviewProfile;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveInterviewAnswersAction, initial);
  const missing = missingBusinessAnswers(answers);
  return (
    <form
      action={formAction}
      className="grid max-w-2xl gap-3 rounded border p-4"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('levels.interview')}</h2>
      <p className="text-xs text-gray-600">{t('interviewHint')}</p>
      {missing.length > 0 && (
        <p role="alert" data-testid="answers-missing" className="text-sm text-amber-800">
          {t('answersMissing', {
            fields: missing
              .map((f) => t(`interviewFields.${f}` as 'interviewFields.account_purpose'))
              .join(', '),
          })}
        </p>
      )}
      {GROUPS.map(({ heading, fields }) => (
        <fieldset key={heading} className="grid gap-3 border-t pt-3">
          <legend className="text-xs font-semibold text-gray-700">{t(heading)}</legend>
          {fields.map((field) => {
            const required = (REQUIRED_INTERVIEW_FIELDS as readonly string[]).includes(field);
            const prose = field === 'nature_of_business' || field === 'products_services';
            return (
              <label key={field} className="text-sm">
                {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
                {required && <span className="text-red-700"> *</span>}
                {prose ? (
                  <textarea
                    name={`interview_${field}`}
                    defaultValue={answers[field] ?? ''}
                    rows={3}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                ) : (
                  <input
                    name={`interview_${field}`}
                    type={field === 'contact_email' ? 'email' : 'text'}
                    defaultValue={answers[field] ?? ''}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                )}
              </label>
            );
          })}
        </fieldset>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="interview-saved" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="save-interview"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('saveInterview')}
      </button>
    </form>
  );
}
