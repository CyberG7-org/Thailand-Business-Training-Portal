'use client';

import { useLocale } from 'next-intl';
import { useActionState } from 'react';
import { signInAction, type SignInState } from './actions';

type Labels = {
  loginId: string;
  password: string;
  submit: string;
  invalid: string;
  disabled: string;
};

export function LoginForm({ labels }: { labels: Labels }) {
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, {
    error: null,
  });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1 text-sm">
        {labels.loginId}
        <input
          name="loginId"
          autoComplete="username"
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.password}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border px-3 py-2"
        />
      </label>
      {state.error && (
        <p role="alert" data-testid="login-error" className="text-sm text-red-700">
          {state.error === 'disabled' ? labels.disabled : labels.invalid}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {labels.submit}
      </button>
    </form>
  );
}
