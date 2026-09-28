'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { startInterviewAction, type StartState } from './actions';

export function StartInterviewButton({ resume }: { resume: boolean }) {
  const locale = useLocale();
  const t = useTranslations('interview');
  const [state, formAction, pending] = useActionState<StartState, FormData>(startInterviewAction, {
    error: null,
  });
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <p
          role="alert"
          className="rounded-control bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-600"
        >
          {t(`errors.${state.error}` as never)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="interview-start"
        className="inline-flex min-h-12 items-center justify-center justify-self-start rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {resume ? t('resume') : t('start')}
      </button>
    </form>
  );
}
