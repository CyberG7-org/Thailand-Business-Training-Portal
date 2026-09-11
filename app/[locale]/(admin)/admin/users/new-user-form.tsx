'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createUserAction, type CreateUserState } from './actions';

const initial: CreateUserState = { ok: false, error: null, createdLoginId: null };

export function NewUserForm() {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [state, formAction, pending] = useActionState(createUserAction, initial);
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold">{t('new')}</h2>
      <label className="text-sm">
        {t('loginId')}
        <input name="loginId" required className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="text"
          required
          minLength={10}
          autoComplete="off"
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>
      <label className="text-sm">
        {t('displayName')}
        <input name="displayName" className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="text-sm">
        {t('language')}
        <select
          name="preferredLanguage"
          defaultValue="th"
          className="mt-1 w-full rounded border px-2 py-1"
        >
          <option value="th">ไทย</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <label className="text-sm">
        {t('role')}
        <select name="role" defaultValue="learner" className="mt-1 w-full rounded border px-2 py-1">
          <option value="learner">{t('roleLearner')}</option>
          <option value="admin">{t('roleAdmin')}</option>
        </select>
      </label>
      {state.error && (
        <p role="alert" data-testid="create-user-error" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="create-user-status" className="text-sm text-green-700">
          {t('created', { loginId: state.createdLoginId ?? '' })}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('create')}
      </button>
    </form>
  );
}
