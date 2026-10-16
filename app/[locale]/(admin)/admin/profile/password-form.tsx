'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/domain/password-policy';
import { changePasswordAction, type ChangePasswordState } from './actions';

const initialState: ChangePasswordState = { error: null, success: false };

export function ChangePasswordForm() {
  const locale = useLocale();
  const t = useTranslations('profile');
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4" data-testid="change-password-form">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <h2>{t('changePassword')}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('hint')}</p>
      </div>
      <label className="grid gap-1 text-sm font-medium text-ink-700">
        {t('currentPassword')}
        <input
          className="staff-input"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-ink-700">
        {t('newPassword')}
        <input
          className="staff-input"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-ink-700">
        {t('confirmPassword')}
        <input
          className="staff-input"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-control bg-bad-50 px-3 py-2 text-sm text-bad-600">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-control bg-ok-50 px-3 py-2 text-sm text-ok-600">
          {t('success')}
        </p>
      )}
      <button type="submit" disabled={pending} className="staff-btn justify-self-start">
        {pending ? t('saving') : t('save')}
      </button>
    </form>
  );
}
