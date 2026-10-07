import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { monthGrid, shiftMonth } from '@/lib/domain/appointments/month';
import { formatDate, type ISODate } from '@/lib/domain/thai-date';
import { bookForLearnerAction } from './actions';
import { StaffForm } from './staff-form';

const LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

export async function MonthCalendar({
  learnerId,
  month,
  today,
  selectedDate,
  locale,
}: {
  learnerId: string;
  month: string;
  today: ISODate;
  selectedDate: ISODate | null;
  locale: AppLocale;
}) {
  const t = await getTranslations('admin.appointments');
  const localeName = LOCALES[locale];
  const [year, number] = month.split('-').map(Number);
  const title = new Intl.DateTimeFormat(localeName, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, number - 1, 1)));
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(localeName, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 4 + index)),
    ),
  );
  const query = (nextMonth: string) => ({ pathname: '/admin/appointments' as const, query: { learner: learnerId, month: nextMonth } });

  return (
    <section data-testid="appointment-month" className="grid gap-4 rounded-card bg-white p-4 shadow-raised md:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link data-testid="month-prev" href={query(shiftMonth(month, -1))} className="staff-btn-ghost staff-btn-sm">
          ‹ {t('prevMonth')}
        </Link>
        <h2 className="text-center font-display text-lg font-semibold text-brand-900">{title}</h2>
        <Link data-testid="month-next" href={query(shiftMonth(month, 1))} className="staff-btn-ghost staff-btn-sm">
          {t('nextMonth')} ›
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-500">
        {weekdays.map((weekday) => <div key={weekday} className="py-1">{weekday}</div>)}
      </div>
      <StaffForm action={bookForLearnerAction} testId="appointment-date-form" successTestId="appointment-saved">
        <input type="hidden" name="learnerId" value={learnerId} />
        <div className="grid grid-cols-7 gap-1.5">
          {monthGrid(month).map((date, index) => (
            <div key={`${month}-${index}`} data-calendar-cell className="min-w-0">
              {date && (
                <button
                  type="submit"
                  name="date"
                  value={date}
                  data-testid={`appointment-date-${date}`}
                  disabled={date < today}
                  aria-current={date === today ? 'date' : undefined}
                  aria-pressed={date === selectedDate}
                  title={formatDate(date, locale)}
                  className="min-h-11 w-full rounded-control border border-ink-100 bg-white px-1 text-sm font-medium tabular-nums text-ink-900 transition-colors hover:border-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-300 aria-pressed:border-brand-600 aria-pressed:bg-brand-600 aria-pressed:text-white"
                >
                  {Number(date.slice(-2))}
                </button>
              )}
            </div>
          ))}
        </div>
      </StaffForm>
    </section>
  );
}
