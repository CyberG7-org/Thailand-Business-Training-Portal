'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/domain/password-policy';
import { validateStaffPasswordChange } from '@/lib/domain/staff-password';
import { changePasswordAction, type ChangePasswordState } from './actions';

const initialState: ChangePasswordState = { error: null, success: false };

export function ChangePasswordForm() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, action, pending] = useActionState(
    async (previous: ChangePasswordState, data: FormData) => {
      const next = await changePasswordAction(previous, data);
      if (next.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        router.refresh();
      }
      return next;
    },
    initialState,
  );
  const meetsMinimum = newPassword.length >= MIN_PASSWORD_LENGTH;
  const meetsMaximum = newPassword.length > 0 && newPassword.length <= MAX_PASSWORD_LENGTH;
  const matches = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canSave =
    !pending && validateStaffPasswordChange(currentPassword, newPassword, confirmPassword) === null;

  return (
    <form action={action} className="grid gap-4" data-testid="change-password-form">
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
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
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
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby="new-password-requirements"
          aria-invalid={newPassword.length > 0 && (!meetsMinimum || !meetsMaximum)}
          required
        />
      </label>
      <ul id="new-password-requirements" className="-mt-2 grid gap-1" aria-live="polite">
        {(
          [
            ['min', meetsMinimum],
            ['max', meetsMaximum],
          ] as const
        ).map(([rule, satisfied]) => (
          <li
            key={rule}
            data-testid={`password-rule-${rule}`}
            data-satisfied={satisfied}
            className={`flex items-center gap-2 text-xs ${satisfied ? 'text-ok-600' : 'text-ink-500'}`}
          >
            <span aria-hidden="true" className="w-4 text-center">
              {satisfied ? '✓' : '○'}
            </span>
            {t(`requirements.${rule}`)}
          </li>
        ))}
      </ul>
      <label className="grid gap-1 text-sm font-medium text-ink-700">
        {t('confirmPassword')}
        <input
          className="staff-input"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-describedby="password-match-status"
          aria-invalid={confirmPassword.length > 0 && !matches}
          required
        />
      </label>
      <p
        id="password-match-status"
        data-testid="password-match-status"
        data-matches={matches}
        aria-live="polite"
        className={`-mt-2 text-xs ${matches ? 'text-ok-600' : confirmPassword ? 'text-bad-600' : 'text-ink-500'}`}
      >
        {confirmPassword
          ? matches
            ? t('requirements.match')
            : t('requirements.noMatch')
          : t('requirements.confirmPending')}
      </p>
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
      <button type="submit" disabled={!canSave} className="staff-btn justify-self-start">
        {pending ? t('saving') : t('save')}
      </button>
    </form>
  );
}
