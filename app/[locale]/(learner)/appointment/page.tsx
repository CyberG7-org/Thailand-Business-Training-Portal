import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { myUpcomingAppointment } from '@/lib/db/appointments';
import { bangkokDateOf } from '@/lib/domain/appointments/slots';
import { formatDate } from '@/lib/domain/thai-date';

/** D102: the manager owns booking; the learner only sees the selected date or the waiting note. */
export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('appointment');
  const mine = await myUpcomingAppointment(user.id);

  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="appointment">
      <section
        data-testid={mine ? 'booking-card' : 'appointment-waiting-manager'}
        className="rise mx-auto grid max-w-[780px] gap-4 rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7"
      >
        <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
          {mine ? t('booked.title') : t('waiting.title')}
        </h2>
        <p className="text-base leading-[1.75] text-ink-900">
          {mine
            ? t('booked.line', {
                date: formatDate(bangkokDateOf(mine.starts_at), locale as AppLocale),
                manager: mine.managerName ?? t('booked.manager'),
              })
            : t('waiting.detail')}
        </p>
      </section>
    </LearnerShell>
  );
}
