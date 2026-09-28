'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from './actions';

/**
 * A form around server-rendered buttons: the locale travels as a hidden field, the error is
 * shown above the content, and everything inside is disabled while the action runs.
 */
export function ActionForm({
  action,
  errorTestId,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  errorTestId: string;
  className?: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations('appointment');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {
    error: null,
  });
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <input type="hidden" name="locale" value={locale} />
      {state.error && (
        <p
          role="alert"
          data-testid={errorTestId}
          className="mb-3 rounded-control bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-600"
        >
          {t(`errors.${state.error}` as never)}
        </p>
      )}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
