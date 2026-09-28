import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { bangkokTimeLabel, type DaySlots, type SlotState } from '@/lib/domain/appointments/slots';
import { addCalendarDays, formatDate, type ISODate } from '@/lib/domain/thai-date';
import { ActionForm } from './action-form';
import { bookAction } from './actions';

const WEEKDAY_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

/** Free slots are the only buttons that press; the rest say why they cannot. */
const SLOT_TONE: Record<SlotState, string> = {
  free: 'border-brand-600 bg-white text-brand-700 hover:bg-brand-50',
  booked: 'border-ink-100 bg-ink-100 text-ink-500 line-through',
  blocked: 'border-ink-100 bg-ink-100 text-ink-500',
  past: 'border-ink-50 bg-ink-50 text-ink-300',
  outside_window: 'border-ink-50 bg-ink-50 text-ink-300',
  holiday: 'border-ink-50 bg-ink-50 text-ink-300',
};

const NAV =
  'inline-flex min-h-11 items-center gap-1.5 rounded-control border border-ink-300 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50';

/**
 * The week (spec §9): one column per day on a desktop, one row per day on a phone; every slot a
 * 44px button, only a free one enabled. Whoever holds a taken slot is never shown.
 */
export async function Week({
  days,
  from,
  today,
  locale,
}: {
  days: DaySlots[];
  from: ISODate;
  today: ISODate;
  locale: AppLocale;
}) {
  const t = await getTranslations('appointment');
  const weekday = new Intl.DateTimeFormat(WEEKDAY_LOCALES[locale], {
    weekday: 'long',
    timeZone: 'Asia/Bangkok',
  });
  return (
    <section className="rise grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
          {t('week', { date: formatDate(from, locale) })}
        </h2>
        <div className="flex gap-2">
          {from > today && (
            <Link
              data-testid="week-prev"
              href={{ pathname: '/appointment', query: { from: addCalendarDays(from, -7) } }}
              className={NAV}
            >
              ‹ {t('prevWeek')}
            </Link>
          )}
          <Link
            data-testid="week-next"
            href={{ pathname: '/appointment', query: { from: addCalendarDays(from, 7) } }}
            className={NAV}
          >
            {t('nextWeek')} ›
          </Link>
        </div>
      </div>
      <ActionForm action={bookAction} errorTestId="booking-error">
        <div className="grid gap-3 md:grid-cols-7 md:gap-2">
          {days.map((day) => {
            const free = day.slots.some((s) => s.state === 'free');
            return (
              <section
                key={day.date}
                data-testid={`day-${day.date}`}
                data-holiday={day.holiday || undefined}
                className="rounded-card bg-white p-3 shadow-raised"
              >
                <h3 className="text-sm leading-[1.7] font-semibold text-ink-900">
                  {weekday.format(new Date(day.date + 'T12:00:00+07:00'))}
                </h3>
                <p className="text-xs leading-[1.6] text-ink-500 tabular-nums">
                  {formatDate(day.date, locale)}
                </p>
                {day.holiday && (
                  <p className="mt-2 rounded-control bg-gold-100 px-2 py-1 text-xs font-medium text-gold-700">
                    {t('holiday')}
                  </p>
                )}
                {!day.holiday && !free && (
                  <p className="mt-2 text-xs text-ink-500">{t('noSlots')}</p>
                )}
                <div className="mt-2 grid gap-1.5">
                  {day.slots.map((slot) => {
                    const time = bangkokTimeLabel(slot.startsAt);
                    return (
                      <button
                        key={slot.startsAt}
                        type="submit"
                        name="startsAt"
                        value={slot.startsAt}
                        data-testid={`slot-${slot.startsAt}`}
                        data-state={slot.state}
                        disabled={slot.state !== 'free'}
                        aria-label={time + ' ' + t(`state.${slot.state}`)}
                        title={t(`state.${slot.state}`)}
                        className={
                          'min-h-11 w-full rounded-control border px-2 text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed ' +
                          SLOT_TONE[slot.state]
                        }
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </ActionForm>
    </section>
  );
}
