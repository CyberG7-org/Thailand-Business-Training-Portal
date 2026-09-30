'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  COMPANY_STATUS_FACTS,
  LEGACY_INTERVIEW_FIELDS,
  type CompanyStatusFact,
  type InterviewProfile,
  type InterviewTextField,
  type YesNo,
} from '@/lib/domain/bank-interview';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

type Field = { field: InterviewTextField; alt?: CompanyStatusFact };

/**
 * The manager's answers, grouped (spec §5.4). A field with `alt` is asked differently when its
 * status fact is "no" (for example expected rather than existing customers), and its label says
 * so the moment the status changes. The same mapping drives the registry's `alternateWhen`.
 */
const GROUPS: { key: 'customers' | 'money' | 'banking'; fields: Field[] }[] = [
  {
    key: 'customers',
    fields: [
      { field: 'business_purpose' },
      { field: 'main_clients', alt: 'has_existing_customers' },
      { field: 'client_origin', alt: 'has_existing_customers' },
      { field: 'customer_examples', alt: 'has_existing_customers' },
      { field: 'customer_profile', alt: 'has_existing_customers' },
      { field: 'main_suppliers', alt: 'has_regular_suppliers' },
      { field: 'business_address', alt: 'operations_started' },
    ],
  },
  {
    key: 'money',
    fields: [
      { field: 'monthly_revenue', alt: 'operations_started' },
      { field: 'revenue_basis', alt: 'operations_started' },
      { field: 'average_transaction', alt: 'has_completed_transactions' },
      { field: 'monthly_transactions', alt: 'has_completed_transactions' },
      { field: 'transaction_details', alt: 'has_completed_transactions' },
      { field: 'source_of_funds' },
      { field: 'first_incoming_funds' },
    ],
  },
  { key: 'banking', fields: [{ field: 'account_purpose' }, { field: 'promptpay_qr_purpose' }] },
];

/**
 * Level 4 — what the bank asks that no DBD document answers (D39, spec §5.4). Editable after
 * confirmation: these are the company's prepared answers, not certificate facts. The contact
 * details and what the business does live in the Level 1 card.
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
  const [status, setStatus] = useState<Record<CompanyStatusFact, YesNo | null>>(
    () =>
      Object.fromEntries(COMPANY_STATUS_FACTS.map((f) => [f, answers[f]])) as Record<
        CompanyStatusFact,
        YesNo | null
      >,
  );
  const label = ({ field, alt }: Field) =>
    alt && status[alt] === 'no'
      ? t(`interviewFieldsAlt.${field}` as 'interviewFieldsAlt.main_clients')
      : t(`interviewFields.${field}` as 'interviewFields.account_purpose');

  return (
    <form
      action={formAction}
      className="staff-card grid max-w-2xl gap-4"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('levels.interview')}</h2>
      <p className="text-sm text-ink-500">{t('interviewHint')}</p>

      <fieldset className="grid gap-3" data-testid="status-facts">
        <legend className="text-sm font-semibold text-ink-700">
          {t('interviewGroups.status')}
        </legend>
        <p className="text-sm text-ink-500">{t('statusFacts.hint')}</p>
        {COMPANY_STATUS_FACTS.map((fact) => (
          <label key={fact} className="text-sm">
            {t(`statusFacts.${fact}` as 'statusFacts.operations_started')}
            <select
              name={`interview_${fact}`}
              value={status[fact] ?? ''}
              onChange={(e) =>
                setStatus((s) => ({ ...s, [fact]: (e.target.value || null) as YesNo | null }))
              }
              className="staff-input mt-1"
              data-testid={`status-${fact}`}
            >
              <option value="">{t('statusFacts.unset')}</option>
              <option value="yes">{t('statusFacts.yes')}</option>
              <option value="no">{t('statusFacts.no')}</option>
            </select>
          </label>
        ))}
      </fieldset>

      {GROUPS.map((group) => (
        <fieldset key={group.key} className="grid gap-3 border-t pt-3">
          <legend className="text-sm font-semibold text-ink-700">
            {t(`interviewGroups.${group.key}` as 'interviewGroups.customers')}
          </legend>
          {group.fields.map((f) => (
            <label key={f.field} className="text-sm">
              <span data-testid={`label-${f.field}`}>{label(f)}</span>
              <textarea
                name={`interview_${f.field}`}
                rows={2}
                defaultValue={answers[f.field] ?? ''}
                className="staff-input mt-1"
              />
            </label>
          ))}
        </fieldset>
      ))}

      <details className="border-t pt-3" data-testid="legacy-answers">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink-700">
          {t('interviewGroups.legacy')}
        </summary>
        <p className="text-sm text-ink-500">{t('legacyHint')}</p>
        {LEGACY_INTERVIEW_FIELDS.map((field) => (
          <label key={field} className="mt-2 block text-sm">
            {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
            <input
              name={`interview_${field}`}
              defaultValue={answers[field] ?? ''}
              className="staff-input mt-1"
            />
          </label>
        ))}
      </details>

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
