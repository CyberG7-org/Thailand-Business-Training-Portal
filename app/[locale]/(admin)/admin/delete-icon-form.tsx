'use client';

import { useLocale } from 'next-intl';
import { useActionState } from 'react';
import type { DeleteState } from './users/actions';

const initial: DeleteState = { error: null };

/** Accessible destructive row action using the platform confirmation dialog. */
export function DeleteIconForm({
  action,
  id,
  label,
  confirmation,
  testId,
}: {
  action: (state: DeleteState, formData: FormData) => Promise<DeleteState>;
  id: string;
  label: string;
  confirmation: string;
  testId: string;
}) {
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      className="inline-grid justify-items-center gap-1"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        data-testid={testId}
        disabled={pending}
        className="inline-flex size-11 items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-bad-50 hover:text-bad-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad-600 disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m6.5 7 .75 13h9.5l.75-13M10 11v5M14 11v5"
          />
        </svg>
      </button>
      {state.error && (
        <span role="alert" className="max-w-36 text-xs text-bad-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
