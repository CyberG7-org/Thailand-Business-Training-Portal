'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatDate, type ISODate } from '@/lib/domain/thai-date';
import { bookForLearnerAction } from './actions';
import { StaffForm } from './staff-form';

/** A date click proposes a booking; only the dialog's confirmation submits it. */
export function BookDateForm({
  learnerId,
  learnerName,
  dates,
  today,
  selectedDate,
  locale,
}: {
  learnerId: string | null;
  learnerName: string;
  dates: (ISODate | null)[];
  today: ISODate;
  selectedDate: ISODate | null;
  locale: AppLocale;
}) {
  const t = useTranslations('admin.appointments');
  const dialog = useRef<HTMLDialogElement>(null);
  const [proposedDate, setProposedDate] = useState<ISODate | null>(null);

  return (
    <StaffForm
      action={bookForLearnerAction}
      testId="appointment-date-form"
      successTestId="appointment-saved"
    >
      <input type="hidden" name="learnerId" value={learnerId ?? ''} />
      <div className="grid grid-cols-7 gap-1.5">
        {dates.map((date, index) => (
          <div key={`${index}-${date ?? 'empty'}`} data-calendar-cell className="min-w-0">
            {date && (
              <button
                type="button"
                data-testid={`appointment-date-${date}`}
                disabled={!learnerId || date < today}
                aria-current={date === today ? 'date' : undefined}
                aria-pressed={date === selectedDate}
                title={formatDate(date, locale)}
                onClick={() => {
                  setProposedDate(date);
                  dialog.current?.showModal();
                }}
                className="min-h-11 w-full rounded-control border border-ink-100 bg-white px-1 text-sm font-medium text-ink-900 tabular-nums transition-colors hover:border-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-300 aria-pressed:border-brand-600 aria-pressed:bg-brand-600 aria-pressed:text-white"
              >
                {Number(date.slice(-2))}
              </button>
            )}
          </div>
        ))}
      </div>
      <dialog
        ref={dialog}
        data-testid="appointment-confirmation"
        aria-labelledby="appointment-confirm-title"
        aria-describedby="appointment-confirm-description"
        className="backdrop:bg-brand-950/60 fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(90vw,28rem)] overflow-y-auto rounded-card border border-ink-100 bg-white p-6 text-ink-900 shadow-raised"
      >
        <h3 id="appointment-confirm-title" className="font-display text-xl font-semibold">
          {t('confirmTitle')}
        </h3>
        <p id="appointment-confirm-description" className="mt-3 text-sm text-ink-700">
          {proposedDate
            ? t('confirmDate', { learner: learnerName, date: formatDate(proposedDate, locale) })
            : ''}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="staff-btn-ghost" onClick={() => dialog.current?.close()}>
            {t('confirmNo')}
          </button>
          <button
            type="submit"
            name="date"
            value={proposedDate ?? ''}
            disabled={!proposedDate}
            className="staff-btn-ok"
            onClick={() => dialog.current?.close()}
          >
            {t('confirmYes')}
          </button>
        </div>
      </dialog>
    </StaffForm>
  );
}
