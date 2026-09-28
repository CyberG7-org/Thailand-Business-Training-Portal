'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { generateNameCardAction, sendNameCardAction, type NameCardState } from './actions';

const initial: NameCardState = { ok: false, error: null, fields: [] };

const PRIMARY =
  'inline-flex min-h-12 items-center gap-2 rounded-control bg-brand-600 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60';
const SECONDARY =
  'inline-flex min-h-12 items-center gap-2 rounded-control border border-ink-300 bg-white px-5 text-base font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60';

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ErrorLine({ state }: { state: NameCardState }) {
  const t = useTranslations('nameCard');
  if (!state.error) return null;
  const known = [
    'no_assignment',
    'exam_required',
    'invalid_phone',
    'invalid_name',
    'missing_fields',
    'not_found',
  ];
  const text = known.includes(state.error)
    ? state.error === 'missing_fields'
      ? t('errors.missing_fields', { fields: state.fields.join(', ') })
      : t(('errors.' + state.error) as 'errors.no_assignment')
    : state.error;
  return (
    <p
      role="alert"
      data-testid="name-card-error"
      className="rounded-control bg-bad-50 px-3.5 py-2.5 text-sm leading-[1.7] font-medium text-bad-600"
    >
      {text}
    </p>
  );
}

/** The form card (handoff, 06): the phone field, its hint, the outcome, and the button. */
const FIELD =
  'min-h-12 w-full rounded-control border border-ink-300 bg-white px-3.5 text-base text-ink-900 transition-colors focus-visible:border-brand-600 focus-visible:outline-offset-1';

export function GenerateForm({
  hasCard,
  defaultPhone,
  defaultHolderTh,
  defaultHolderEn,
}: {
  hasCard: boolean;
  defaultPhone: string;
  defaultHolderTh: string;
  defaultHolderEn: string;
}) {
  const locale = useLocale();
  const t = useTranslations('nameCard');
  const [state, formAction, pending] = useActionState(generateNameCardAction, initial);
  const id = useId();
  const nameId = useId();
  const nameEnId = useId();
  return (
    <form
      action={formAction}
      className="rise flex flex-col gap-4 rounded-card bg-white p-5 shadow-raised md:p-6"
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-sm leading-[1.7] font-semibold text-ink-900">
          {t('holderName')}
        </label>
        <input
          id={nameId}
          name="holderNameTh"
          defaultValue={state.values?.holderNameTh ?? defaultHolderTh}
          required
          maxLength={120}
          className={FIELD}
        />
        <span className="text-sm leading-[1.7] text-ink-500">{t('holderNameHint')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameEnId} className="text-sm leading-[1.7] font-semibold text-ink-900">
          {t('holderNameEn')}
        </label>
        <input
          id={nameEnId}
          name="holderNameEn"
          defaultValue={state.values?.holderNameEn ?? defaultHolderEn}
          maxLength={120}
          className={FIELD}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm leading-[1.7] font-semibold text-ink-900">
          {t('phone')}
        </label>
        <input
          id={id}
          name="phone"
          inputMode="tel"
          placeholder="08X-XXX-XXXX"
          defaultValue={state.values?.phone ?? defaultPhone}
          required
          className={FIELD + ' tabular-nums'}
        />
        <span className="text-sm leading-[1.7] text-ink-500">{t('phoneHint')}</span>
      </div>
      <ErrorLine state={state} />
      {state.ok && (
        <p
          role="status"
          className="inline-flex items-center gap-2 rounded-control bg-ok-50 px-3.5 py-2.5 text-sm leading-[1.7] font-medium text-ok-600"
        >
          <CheckIcon />
          {t('generated')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="generate-card"
        className={'self-start ' + (hasCard ? SECONDARY : PRIMARY)}
      >
        {pending ? t('generating') : hasCard ? t('regenerate') : t('generate')}
      </button>
    </form>
  );
}

/** Send to Telegram, beside Download in the preview's footer; the outcome sits inline. */
export function SendForm({ cardId, sentAt }: { cardId: string; sentAt: string | null }) {
  const locale = useLocale();
  const t = useTranslations('nameCard');
  const [state, formAction, pending] = useActionState(sendNameCardAction, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="cardId" value={cardId} />
      <button type="submit" disabled={pending} data-testid="send-card" className={SECONDARY}>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 4 3 11l6 2 2 6 3-4 5 4z" />
        </svg>
        {sentAt ? t('sendAgain') : t('send')}
      </button>
      {state.ok && (
        <p
          role="status"
          data-testid="card-sent"
          className="text-sm leading-[1.7] font-medium text-ok-600"
        >
          {state.queued ? t('sentQueued', { count: state.queued }) : t('sentNoDestinations')}
        </p>
      )}
      <ErrorLine state={state} />
    </form>
  );
}
