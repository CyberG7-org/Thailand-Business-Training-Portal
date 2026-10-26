'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  deleteLearnerFromDetailAction,
  resetPasswordAction,
  setStatusAction,
  type AccountActionState,
} from './actions';
import { DeleteIconForm } from '../../delete-icon-form';

const initial: AccountActionState = { message: null, error: null };

export function PasswordResetForm({ userId }: { userId: string }) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [pwState, pwAction, pwPending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={pwAction} className="staff-card grid gap-2" data-testid="password-card">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="userId" value={userId} />
      <label className="text-sm">
        {t('newPassword')}
        <input
          name="password"
          type="text"
          required
          minLength={6}
          maxLength={8}
          autoComplete="off"
          className="staff-input mt-1"
        />
      </label>
      {pwState.error && (
        <p role="alert" className="text-sm text-bad-600">
          {pwState.error}
        </p>
      )}
      {pwState.message && (
        <p role="status" className="text-sm text-ok-600">
          {t('passwordUpdated')}
        </p>
      )}
      <button type="submit" disabled={pwPending} className="staff-btn">
        {t('resetPassword')}
      </button>
    </form>
  );
}

export function AccountStatusControls({
  userId,
  status,
  loginId,
}: {
  userId: string;
  status: 'active' | 'disabled';
  loginId: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const tl = useTranslations('admin.learners');
  const [stState, stAction, stPending] = useActionState(setStatusAction, initial);
  return (
    <div className="staff-card grid gap-4" data-testid="account-actions-card">
      <form action={stAction} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={status === 'active' ? 'disabled' : 'active'} />
        {stState.error && (
          <p role="alert" className="text-sm text-bad-600">
            {stState.error}
          </p>
        )}
        <button type="submit" disabled={stPending} className="staff-btn-ghost">
          {status === 'active' ? t('disable') : t('enable')}
        </button>
      </form>
      {loginId && (
        <div className="border-t border-ink-100 pt-4">
          <DeleteIconForm
            action={deleteLearnerFromDetailAction}
            id={userId}
            label={tl('deleteAccount')}
            confirmation={tl('deleteLearnerConfirm', { loginId })}
            testId="delete-learner-account"
            appearance="button"
          />
        </div>
      )}
    </div>
  );
}
