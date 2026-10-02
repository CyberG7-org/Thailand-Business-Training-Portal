'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import type { VariantStatus } from '@/lib/domain/mcq/variant';
import {
  approveDraftsAction,
  loadStarterAction,
  setVariantStatusAction,
  type ApproveDraftsState,
  type StarterState,
  type StatusState,
} from './bank-actions';
import { IssueList } from './variant-form';

const starterInitial: StarterState = { done: false, created: 0, failed: false };

/** Offered while some starter drafts are not in the bank yet. */
export function StarterForm({ count }: { count: number }) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(loadStarterAction, starterInitial);
  return (
    <form action={formAction} className="staff-card grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-ink-700">{t('starterHint')}</p>
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('starterFailed')}
        </p>
      )}
      {state.done && (
        <p role="status" data-testid="starter-loaded" className="text-sm text-ok-600">
          {t('starterLoaded', { count: state.created })}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="load-starter"
        className="staff-btn-ghost justify-self-start"
      >
        {t('loadStarter', { count })}
      </button>
    </form>
  );
}

const approveInitial: ApproveDraftsState = { done: false, approved: 0, failed: false };

/** One button for every draft that keeps the rules, behind a confirm step naming the count. */
export function ApproveDraftsForm({ count }: { count: number }) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(approveDraftsAction, approveInitial);
  const [confirming, setConfirming] = useState(false);
  // Nothing to approve and nothing to report: no card at all.
  if (count === 0 && !state.done && !state.failed) return null;
  return (
    <form action={formAction} className="staff-card grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('approveDraftsFailed')}
        </p>
      )}
      {state.done && (
        <p role="status" data-testid="drafts-approved" className="text-sm text-ok-600">
          {t('approveDraftsDone', { count: state.approved })}
        </p>
      )}
      {count > 0 && <p className="text-sm text-ink-700">{t('approveDraftsHint')}</p>}
      {count > 0 && !confirming && (
        <button
          type="button"
          data-testid="approve-drafts"
          onClick={() => setConfirming(true)}
          className="staff-btn-ok justify-self-start"
        >
          {t('approveDrafts', { count })}
        </button>
      )}
      {count > 0 && confirming && (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-ink-900">{t('approveDraftsConfirm', { count })}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              data-testid="approve-drafts-confirm"
              className="staff-btn-ok"
            >
              {t('approveDraftsYes')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="staff-btn-ghost"
            >
              {t('approveDraftsCancel')}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

const statusInitial: StatusState = { failed: false, issues: [] };
const MOVES: { to: VariantStatus; label: 'approve' | 'toDraft' | 'retire'; testId: string }[] = [
  { to: 'approved', label: 'approve', testId: 'variant-approve' },
  { to: 'draft', label: 'toDraft', testId: 'variant-draft' },
  { to: 'retired', label: 'retire', testId: 'variant-retire' },
];

/** Where the variant stands, and the two places it may go from there. */
export function VariantStatusForm({ id, status }: { id: string; status: VariantStatus }) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(setVariantStatusAction, statusInitial);
  return (
    <form action={formAction} className="staff-card grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        {t('variant.statusTitle')}:{' '}
        <span className="staff-tag" data-testid="variant-status" data-status={status}>
          {t(`status.${status}` as 'status.draft')}
        </span>
      </p>
      <p className="text-sm text-ink-700">{t('variant.approveHint')}</p>
      <IssueList issues={state.issues} />
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('issues.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {MOVES.filter((move) => move.to !== status).map((move) => (
          <button
            key={move.to}
            type="submit"
            name="status"
            value={move.to}
            disabled={pending}
            data-testid={move.testId}
            className={move.to === 'approved' ? 'staff-btn-ok' : 'staff-btn-ghost'}
          >
            {t(`variant.${move.label}` as 'variant.approve')}
          </button>
        ))}
      </div>
    </form>
  );
}
