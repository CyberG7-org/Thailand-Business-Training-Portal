'use client';

import { useLocale } from 'next-intl';
import { useActionState, useId, useState, type CSSProperties } from 'react';
import { signInAction, type SignInState } from './actions';

type Labels = {
  title: string;
  hint: string;
  loginId: string;
  password: string;
  submit: string;
  invalid: string;
  disabled: string;
  showPassword: string;
  hidePassword: string;
};

const FIELD =
  'min-h-12 w-full rounded-control border bg-white px-3.5 text-base text-ink-900 transition-colors focus-visible:border-brand-600 focus-visible:outline-offset-1';
const FINE = 'border-ink-300';
const AT_FAULT = 'border-2 border-bad-600';

/**
 * The sign-in card (design handoff, Login). The error is announced above the fields and marks
 * the field at fault: both on a failed sign-in, since the message is deliberately generic
 * (AUTH-004), the login id alone when the account is disabled.
 */
export function LoginForm({
  labels,
  initialError = null,
}: {
  labels: Labels;
  /** The account was found disabled on a later request and the visitor was sent back here. */
  initialError?: SignInState['error'];
}) {
  const locale = useLocale();
  const [show, setShow] = useState(false);
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {
    error: initialError,
  });
  const ids = { loginId: useId(), password: useId(), error: useId() };
  const error = state.error;
  const describedBy = error ? ids.error : undefined;

  return (
    <form
      action={formAction}
      className="rise flex w-full max-w-[420px] flex-col gap-5 rounded-sheet bg-white p-6 shadow-[0_2px_6px_rgb(12_26_58/0.06),0_16px_40px_rgb(12_26_58/0.1)] lg:px-9 lg:pt-9 lg:pb-8"
      style={{ '--rise-delay': '160ms' } as CSSProperties}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] leading-[1.4] font-semibold text-brand-900 lg:text-[28px]">
          {labels.title}
        </h2>
        <p className="text-sm leading-[1.7] text-ink-500">{labels.hint}</p>
      </div>

      {error && (
        <p
          id={ids.error}
          role="alert"
          data-testid="login-error"
          className="flex gap-2.5 rounded-control bg-bad-50 px-3.5 py-3 text-sm leading-[1.7] font-medium text-bad-600"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-[3px] shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.5" />
          </svg>
          {error === 'disabled' ? labels.disabled : labels.invalid}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.loginId} className="text-sm leading-[1.7] font-semibold">
          {labels.loginId}
        </label>
        <input
          id={ids.loginId}
          name="loginId"
          autoComplete="username"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${FIELD} ${error ? AT_FAULT : FINE}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.password} className="text-sm leading-[1.7] font-semibold">
          {labels.password}
        </label>
        <div className="relative flex">
          <input
            id={ids.password}
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-invalid={error === 'invalid' ? true : undefined}
            aria-describedby={describedBy}
            className={`${FIELD} pr-[52px] ${error === 'invalid' ? AT_FAULT : FINE}`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? labels.hidePassword : labels.showPassword}
            aria-pressed={show}
            className="absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-[6px] text-ink-500 transition-colors hover:text-brand-700"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {show && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex min-h-[52px] items-center justify-center rounded-control bg-brand-600 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
