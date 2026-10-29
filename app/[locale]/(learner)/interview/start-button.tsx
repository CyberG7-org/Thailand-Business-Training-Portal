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
    <form action={formAction} className="grid justify-items-center gap-3 text-center">
      <input type="hidden" name="locale" value={locale} />
      {!resume && (
        <label className="grid w-full max-w-sm gap-1 text-sm font-medium text-ink-900">
          {t('chooseLanguage')}
          <select
            name="interviewLanguage"
            defaultValue={locale}
            className="staff-input w-full text-center"
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="zh">简体中文</option>
            <option value="ta">தமிழ்</option>
            <option value="ms">Bahasa Melayu</option>
          </select>
          <span className="text-ink-600 text-xs font-normal">{t('languageLocked')}</span>
        </label>
      )}
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
        className="inline-flex min-h-12 items-center justify-center justify-self-center rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {resume ? t('resume') : t('start')}
      </button>
    </form>
  );
}
