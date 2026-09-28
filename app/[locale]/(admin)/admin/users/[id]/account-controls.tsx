'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { resetPasswordAction, setStatusAction, type AccountActionState } from './actions';

const initial: AccountActionState = { message: null, error: null };

export function AccountControls({
  userId,
  status,
}: {
  userId: string;
  status: 'active' | 'disabled';
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [pwState, pwAction, pwPending] = useActionState(resetPasswordAction, initial);
  const [stState, stAction, stPending] = useActionState(setStatusAction, initial);
  return (
    <div className="grid max-w-md gap-4">
      <form action={pwAction} className="staff-card grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <label className="text-sm">
          {t('newPassword')}
          <input
            name="password"
            type="text"
            required
            minLength={10}
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
      <form action={stAction} className="staff-card grid gap-2">
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
    </div>
  );
}
