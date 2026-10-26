import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { monthGrid, shiftMonth } from '@/lib/domain/appointments/month';
import type { ISODate } from '@/lib/domain/thai-date';
import { BookDateForm } from './book-date-form';

const LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

export async function MonthCalendar({
  learnerId,
  learnerName,
  month,
  today,
  selectedDate,
  locale,
}: {
  learnerId: string | null;
  learnerName: string;
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
  const query = (nextMonth: string) => ({
    pathname: '/admin/appointments' as const,
    query: { learner: learnerId ?? '', month: nextMonth },
  });

  return (
    <section
      data-testid="appointment-month"
      className="grid gap-4 rounded-card bg-white p-4 shadow-raised md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        {learnerId ? (
          <Link
            data-testid="month-prev"
            href={query(shiftMonth(month, -1))}
            className="staff-btn-ghost staff-btn-sm"
          >
            ‹ {t('prevMonth')}
          </Link>
        ) : (
          <button
            type="button"
            data-testid="month-prev"
            disabled
            className="staff-btn-ghost staff-btn-sm"
          >
            ‹ {t('prevMonth')}
          </button>
        )}
        <h2 className="text-center font-display text-lg font-semibold text-brand-900">{title}</h2>
        {learnerId ? (
          <Link
            data-testid="month-next"
            href={query(shiftMonth(month, 1))}
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('nextMonth')} ›
          </Link>
        ) : (
          <button
            type="button"
            data-testid="month-next"
            disabled
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('nextMonth')} ›
          </button>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-500">
        {weekdays.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>
      <BookDateForm
        learnerId={learnerId}
        learnerName={learnerName}
        dates={monthGrid(month)}
        today={today}
        selectedDate={selectedDate}
        locale={locale}
      />
    </section>
  );
}
