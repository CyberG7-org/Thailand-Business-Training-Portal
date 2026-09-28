'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import type { StaffActionState } from './actions';

/** A small form around one staff action: the locale as a hidden field, the error beside it. */
export function StaffForm({
  action,
  testId,
  className,
  children,
}: {
  action: (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations('appointment');
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(action, {
    error: null,
  });
  return (
    <form action={formAction} data-testid={testId} className={className} aria-busy={pending}>
      <input type="hidden" name="locale" value={locale} />
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {t(`errors.${state.error}` as never)}
        </p>
      )}
    </form>
  );
}
