'use client';

import { useActionState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { displayLoginId } from '@/lib/domain/login-id';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/domain/password-policy';
import { submanagerAction, type SubmanagerState } from './actions';

const initial: SubmanagerState = { ok: false, error: null, createdLoginId: null };

function AccountForm({
  operation,
  id,
  children,
  className,
}: {
  operation: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.submanagers');
  const [state, action, pending] = useActionState(submanagerAction, initial);
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (operation === 'archive' && !window.confirm(t('confirmArchive'))) event.preventDefault();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="operation" value={operation} />
      {id && <input type="hidden" name="id" value={id} />}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-ok-600">
          {state.createdLoginId ? displayLoginId(state.createdLoginId) : t('saved')}
        </p>
      )}
    </form>
  );
}

function PasswordField() {
  const t = useTranslations('admin.submanagers');
  return (
    <label className="text-sm">
      {t('password')}
      <input
        className="staff-input mt-1"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
      />
    </label>
  );
}

export function NewSubmanagerForm({ prefix }: { prefix: string }) {
  const t = useTranslations('admin.submanagers');
  return (
    <AccountForm operation="create" className="staff-card grid max-w-md gap-3">
      <h2 className="text-sm font-semibold">{t('new')}</h2>
      <label className="text-sm">
        {t('loginId')}
        <span className="mt-1 flex items-center gap-2">
          <span className="font-mono">{displayLoginId(prefix)}</span>
          <input
            aria-label={t('suffix')}
            className="staff-input"
            name="suffix"
            required
            pattern="[A-Za-z0-9]{2}"
            minLength={2}
            maxLength={2}
            autoComplete="off"
          />
        </span>
      </label>
      <p className="text-xs text-ink-500">{t('suffixHint')}</p>
      <label className="text-sm">
        {t('displayName')}
        <input className="staff-input mt-1" name="displayName" maxLength={120} />
      </label>
      <PasswordField />
      <button className="staff-btn justify-self-start" type="submit">
        {t('create')}
      </button>
    </AccountForm>
  );
}

export function SubmanagerControls({ id, status }: { id: string; status: string }) {
  const t = useTranslations('admin.submanagers');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <AccountForm operation="status" id={id}>
        <input type="hidden" name="status" value={status === 'active' ? 'disabled' : 'active'} />
        <button className="staff-btn-ghost staff-btn-sm">
          {status === 'active' ? t('disable') : t('enable')}
        </button>
      </AccountForm>
      <AccountForm operation="password" id={id} className="flex flex-wrap items-end gap-2">
        <PasswordField />
        <button className="staff-btn-ghost staff-btn-sm">{t('resetPassword')}</button>
      </AccountForm>
      <AccountForm operation="archive" id={id}>
        <button className="staff-btn-ghost staff-btn-sm text-bad-600">{t('delete')}</button>
      </AccountForm>
    </div>
  );
}
