'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { loadStarterAction, type StarterState } from './bank-actions';

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
