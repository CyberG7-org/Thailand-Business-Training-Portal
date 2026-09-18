'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { INTERVIEW_FIELDS, type InterviewProfile } from '@/lib/domain/bank-interview';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

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
      {INTERVIEW_FIELDS.map((field) => (
        <label key={field} className="text-sm">
          {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
          <input
            name={`interview_${field}`}
            defaultValue={answers[field] ?? ''}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
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
