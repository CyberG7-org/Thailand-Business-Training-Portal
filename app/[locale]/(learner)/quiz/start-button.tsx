'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { startQuizAction, type StartState } from './actions';

export function StartQuizButton({ resume }: { resume: boolean }) {
  const locale = useLocale();
  const t = useTranslations('quiz');
  const [state, formAction, pending] = useActionState<StartState, FormData>(startQuizAction, {
    error: null,
  });
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${state.error}` as never)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="start-quiz"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {resume ? t('resume') : t('start')}
      </button>
    </form>
  );
}
