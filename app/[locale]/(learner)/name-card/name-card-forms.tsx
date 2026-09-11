'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { generateNameCardAction, sendNameCardAction, type NameCardState } from './actions';

const initial: NameCardState = { ok: false, error: null, fields: [] };

function ErrorLine({ state }: { state: NameCardState }) {
  const t = useTranslations('nameCard');
  if (!state.error) return null;
  const known = ['no_assignment', 'exam_required', 'invalid_phone', 'missing_fields', 'not_found'];
  const text = known.includes(state.error)
    ? state.error === 'missing_fields'
      ? t('errors.missing_fields', { fields: state.fields.join(', ') })
      : t(`errors.${state.error}` as 'errors.no_assignment')
    : state.error;
  return (
    <p role="alert" data-testid="name-card-error" className="text-sm text-red-700">
      {text}
    </p>
  );
}

export function GenerateForm({
  hasCard,
  defaultPhone,
}: {
  hasCard: boolean;
  defaultPhone: string;
}) {
  const locale = useLocale();
  const t = useTranslations('nameCard');
  const [state, formAction, pending] = useActionState(generateNameCardAction, initial);
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="text-sm">
        {t('phone')}
        <input
          name="phone"
          inputMode="tel"
          placeholder="08X-XXX-XXXX"
          defaultValue={defaultPhone}
          required
          className="mt-1 w-full rounded border px-2 py-1"
        />
        <span className="text-xs text-gray-500">{t('phoneHint')}</span>
      </label>
      <ErrorLine state={state} />
      {state.ok && (
        <p role="status" className="text-sm text-green-700">
          {t('generated')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="generate-card"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? t('generating') : hasCard ? t('regenerate') : t('generate')}
      </button>
    </form>
  );
}

export function SendForm({ cardId, sentAt }: { cardId: string; sentAt: string | null }) {
  const locale = useLocale();
  const t = useTranslations('nameCard');
  const [state, formAction, pending] = useActionState(sendNameCardAction, initial);
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="cardId" value={cardId} />
      <ErrorLine state={state} />
      {state.ok && (
        <p role="status" data-testid="card-sent" className="text-sm text-green-700">
          {state.queued ? t('sentQueued', { count: state.queued }) : t('sentNoDestinations')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="send-card"
        className="justify-self-start rounded border px-4 py-2 text-sm disabled:opacity-50"
      >
        {sentAt ? t('sendAgain') : t('send')}
      </button>
    </form>
  );
}
