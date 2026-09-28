'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CONTACT_FIELDS,
  INTERVIEW_FIELDS,
  type InterviewProfile,
} from '@/lib/domain/bank-interview';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

/**
 * The company contact and what it sells moved up to Level 1, where a manager looks after an
 * upload (owner, 2026-09-24). What is left here is the bank's own interview.
 */
const BUSINESS_FIELDS = ['nature_of_business', 'products_services'] as const;
const BANK_FIELDS = INTERVIEW_FIELDS.filter(
  (f) =>
    !(CONTACT_FIELDS as readonly string[]).includes(f) &&
    !(BUSINESS_FIELDS as readonly string[]).includes(f),
);

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
      className="staff-card grid max-w-2xl gap-3"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('levels.interview')}</h2>
      <p className="text-xs text-ink-500">{t('interviewHint')}</p>
      {BANK_FIELDS.map((field) => (
        <label key={field} className="text-sm">
          {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
          <input
            name={`interview_${field}`}
            defaultValue={answers[field] ?? ''}
            className="staff-input mt-1"
          />
        </label>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="interview-saved" className="text-sm text-ok-600">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="save-interview"
        className="staff-btn justify-self-start"
      >
        {t('saveInterview')}
      </button>
    </form>
  );
}
