'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatDate, type Locale } from '@/lib/domain/thai-date';
import { useActionState } from 'react';
import { assignRecordAction, deactivateAssignmentAction, type AccountActionState } from './actions';

type Option = {
  id: string;
  company_name_th: string | null;
  juristic_id: string | null;
  issued_on: string | null;
};
type Current = {
  assignmentId: string;
  companyNameTh: string | null;
  issuedOn: string | null;
  availableFromLabel: string | null;
} | null;

const initial: AccountActionState = { message: null, error: null };
const ASSIGN_ERROR_KEYS = [
  'no-record',
  'already-assigned',
  'not-confirmed',
  'company-taken',
] as const;

export function AssignmentPanel({
  userId,
  current,
  options,
}: {
  userId: string;
  current: Current;
  options: Option[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.assignment');
  const [assignState, assignAction, assigning] = useActionState(assignRecordAction, initial);
  const [deactState, deactAction, deactivating] = useActionState(
    deactivateAssignmentAction,
    initial,
  );
  const assignErrorKey = ASSIGN_ERROR_KEYS.find((k) => k === assignState.error);
  return (
    <div className="staff-card grid max-w-md gap-2">
      <h2 className="font-semibold">{t('title')}</h2>
      {current ? (
        <form action={deactAction} className="grid gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={current.assignmentId} />
          <p className="text-sm" data-testid="assigned-company">
            {current.companyNameTh ?? '—'}
          </p>
          <p className="text-sm" data-testid="available-from">
            {current.availableFromLabel
              ? t('availableFrom', { date: current.availableFromLabel })
              : t('eligibilityPending')}
          </p>
          {deactState.error && (
            <p role="alert" className="text-sm text-bad-600">
              {deactState.error}
            </p>
          )}
          <button type="submit" disabled={deactivating} className="staff-btn-ghost">
            {t('deactivate')}
          </button>
        </form>
      ) : (
        <form action={assignAction} className="grid gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <select name="dbdRecordId" defaultValue="" className="staff-input">
            <option value="">{t('choose')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.company_name_th ?? o.id} · {o.juristic_id ?? '—'} ·{' '}
                {o.issued_on ? formatDate(o.issued_on, locale as Locale) : '—'}
              </option>
            ))}
          </select>
          {assignState.error && (
            <p role="alert" className="text-sm text-bad-600">
              {assignErrorKey ? t(`errors.${assignErrorKey}`) : assignState.error}
            </p>
          )}
          <button type="submit" disabled={assigning} className="staff-btn">
            {t('assign')}
          </button>
        </form>
      )}
    </div>
  );
}
