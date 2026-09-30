'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { MANAGER_PREFIX, displayLoginId } from '@/lib/domain/login-id';
import { suggestLoginIdAction } from '../login-id-actions';
import { LoginIdField } from '../login-id-field';
import { createManagerAction, type ManagerState } from './actions';

const initial: ManagerState = { ok: false, error: null, createdLoginId: null };

export function NewManagerForm({ initialSuffix }: { initialSuffix: string | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.managers');
  // The code just created is taken now, so a success brings the next suggestion (D69).
  const [suggestion, setSuggestion] = useState({ suffix: initialSuffix, version: 0 });
  const [state, formAction, pending] = useActionState(
    async (prev: ManagerState, formData: FormData) => {
      const next = await createManagerAction(prev, formData);
      if (next.ok) {
        const { suffix } = await suggestLoginIdAction({ locale, kind: 'manager' });
        setSuggestion((s) => ({ suffix, version: s.version + 1 }));
      }
      return next;
    },
    initial,
  );
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-sm font-semibold">{t('new')}</h2>
      <LoginIdField
        key={suggestion.version}
        kind="manager"
        prefix={MANAGER_PREFIX}
        initialSuffix={suggestion.suffix}
      />
      <label className="text-sm">
        {t('displayName')}
        <input name="displayName" required className="staff-input mt-1" />
      </label>
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          className="staff-input mt-1"
        />
      </label>
      {state.error && (
        <p role="alert" data-testid="create-manager-error" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.ok && state.createdLoginId && (
        <p role="status" data-testid="created-manager" className="text-sm text-ok-600">
          {displayLoginId(state.createdLoginId)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="create-manager"
        className="staff-btn justify-self-start"
      >
        {t('create')}
      </button>
    </form>
  );
}
