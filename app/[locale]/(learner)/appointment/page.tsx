import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { appointmentConfig, learnerCalendar, myUpcomingAppointment } from '@/lib/db/appointments';
import { bangkokDateOf, bangkokTimeLabel } from '@/lib/domain/appointments/slots';
import { formatDate, isISODate, todayInBangkok } from '@/lib/domain/thai-date';
import { ActionForm } from './action-form';
import { cancelAction } from './actions';
import { Week } from './week';

/**
 * The learner's appointment (spec §5.3): the booked card with cancel, or the week picker, or
 * why the step is not open yet. The date the step opens is the same one the dashboard shows.
 */
export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ locale }, { from: fromParam }] = await Promise.all([params, searchParams]);
  const user = await requireUser(locale);
  const loc = locale as AppLocale;
  const [t, td, ts] = await Promise.all([
    getTranslations('appointment'),
    getTranslations('dashboard'),
    getTranslations('stages'),
  ]);
  const today = todayInBangkok();
  const from = fromParam && isISODate(fromParam) && fromParam >= today ? fromParam : today;

  const mine = await myUpcomingAppointment(user.id);
  if (mine) {
    const { noticeHours } = await appointmentConfig();
    return (
      <LearnerShell title={t('title')} intro={t('intro')} step="appointment">
        <section
          data-testid="booking-card"
          className="rise mx-auto grid max-w-[780px] gap-4 rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7"
        >
          <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
            {t('booked.title')}
          </h2>
          <p className="text-base leading-[1.75] text-ink-900">
            {t('booked.line', {
              date: formatDate(bangkokDateOf(mine.starts_at), loc),
              time: bangkokTimeLabel(mine.starts_at),
              manager: mine.managerName ?? t('booked.adminCalendar'),
            })}
          </p>
          <p className="text-sm leading-[1.7] text-ink-700">
            {t('booked.cancelHint', { hours: noticeHours })}
          </p>
          <ActionForm action={cancelAction} errorTestId="booking-error">
            <input type="hidden" name="appointmentId" value={mine.id} />
            <button
              type="submit"
              data-testid="cancel-booking"
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-ink-300 px-5 text-base font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              {t('booked.cancel')}
            </button>
          </ActionForm>
        </section>
      </LearnerShell>
    );
  }

  const { gate, days, window } = await learnerCalendar(user.id, from);
  if (gate.status !== 'available') {
    const reason =
      gate.reason === 'before_available_from' && window
        ? td('appointment.lockedUntil', { date: formatDate(window.availableFrom, loc) })
        : gate.reason === 'missing_issue_date'
          ? td('appointment.pending')
          : gate.reason
            ? ts(`reasons.${gate.reason}`)
            : ts(`status.${gate.status}`);
    return (
      <LearnerShell title={t('title')} intro={t('intro')} step="appointment">
        <section className="rise mx-auto max-w-[780px] rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7">
          <p
            data-testid="appointment-blocked"
            className="rounded-control bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700"
          >
            {reason}
          </p>
        </section>
      </LearnerShell>
    );
  }

  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="appointment">
      <div className="mx-auto max-w-[1100px]">
        <Week days={days} from={from} today={today} locale={loc} />
      </div>
    </LearnerShell>
  );
}
