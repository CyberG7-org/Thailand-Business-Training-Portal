'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { displayLoginId } from '@/lib/domain/login-id';
import { createManagerAction, type ManagerState } from './actions';

const initial: ManagerState = { ok: false, error: null, createdLoginId: null };

export function NewManagerForm() {
  const locale = useLocale();
  const t = useTranslations('admin.managers');
  const [state, formAction, pending] = useActionState(createManagerAction, initial);
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-sm font-semibold">{t('new')}</h2>
      <label className="text-sm">
        {t('displayName')}
        <input name="displayName" required className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>
      {state.error && (
        <p role="alert" data-testid="create-manager-error" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && state.createdLoginId && (
        <p role="status" data-testid="created-manager" className="text-sm text-green-700">
          {displayLoginId(state.createdLoginId)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="create-manager"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('create')}
      </button>
    </form>
  );
}
