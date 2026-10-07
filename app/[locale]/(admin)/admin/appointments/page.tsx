import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { listAppointmentsForStaff } from '@/lib/db/appointments';
import { loadLearnerRecords } from '@/lib/db/learner-record';
import { createSupabaseServerClient } from '@/lib/db/server';
import { bangkokDateOf } from '@/lib/domain/appointments/slots';
import { displayLoginId } from '@/lib/domain/login-id';
import { formatDate, todayInBangkok } from '@/lib/domain/thai-date';
import { cancelBookingAction } from './actions';
import { MonthCalendar } from './month-calendar';
import { StaffForm } from './staff-form';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** D102: managers choose one date for a learner after both evaluations are passed. */
export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ learner?: string; month?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const staff = await requireStaff(locale);
  const loc = locale as AppLocale;
  const db = await createSupabaseServerClient();
  const today = todayInBangkok();
  const month = query.month && VALID_MONTH.test(query.month) ? query.month : today.slice(0, 7);
  const [t, learners, bookings] = await Promise.all([
    getTranslations('admin.appointments'),
    loadLearnerRecords(db),
    listAppointmentsForStaff(db, {
      teamId: staff.role === 'manager' ? staff.id : undefined,
      from: today,
    }),
  ]);
  const selected =
    staff.role === 'manager' && query.learner
      ? (learners.find((learner) => learner.id === query.learner) ?? null)
      : null;
  const selectedReady = selected?.mcq === 'pass' && selected.chatbot === 'pass';
  const selectedDate = selected?.appointmentAt ? bangkokDateOf(selected.appointmentAt) : null;

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="staff-title">{t('title')}</h1>
        <p className="staff-intro mt-1">{t('intro')}</p>
      </div>

      {staff.role === 'manager' ? (
        <section className="grid gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-brand-900">
              {t('bookingTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-700">{t('bookingIntro')}</p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium text-ink-900">
              {t('chooseLearner')}
              <select
                name="learner"
                data-testid="appointment-learner"
                defaultValue={selected?.id ?? ''}
                required
                className="staff-input"
              >
                <option value="">{t('choose')}</option>
                {learners.map((learner) => {
                  const ready = learner.mcq === 'pass' && learner.chatbot === 'pass';
                  return (
                    <option key={learner.id} value={learner.id} disabled={!ready}>
                      {displayLoginId(learner.loginId)} · {learner.company?.nameTh ?? '—'}
                      {!ready
                        ? ` · ${learner.mcq !== 'pass' ? t('needsQuiz') : t('needsInterview')}`
                        : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="staff-btn-primary">
              {t('showCalendar')}
            </button>
          </form>
          {selected && !selectedReady && (
            <p className="rounded-control bg-warn-50 px-4 py-3 text-sm font-medium text-warn-700">
              {selected.mcq !== 'pass' ? t('needsQuiz') : t('needsInterview')}
            </p>
          )}
          {selected && selectedReady && (
            <MonthCalendar
              learnerId={selected.id}
              month={month}
              today={today}
              selectedDate={selectedDate}
              locale={loc}
            />
          )}
        </section>
      ) : (
        <p className="rounded-control bg-ink-50 px-4 py-3 text-sm text-ink-700">
          {t('ownerReadOnly')}
        </p>
      )}

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-semibold text-brand-900">{t('upcoming')}</h2>
        {bookings.length === 0 ? (
          <p data-testid="admin-appointments-empty" className="text-sm text-ink-700">
            {t('empty')}
          </p>
        ) : (
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('learner')}</th>
                  <th>{t('company')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} data-testid={`admin-appointment-${booking.id}`}>
                    <td className="whitespace-nowrap">
                      {formatDate(bangkokDateOf(booking.starts_at), loc)}
                    </td>
                    <td>
                      {displayLoginId(booking.profiles.login_id)}
                      {booking.profiles.display_name ? ` · ${booking.profiles.display_name}` : ''}
                    </td>
                    <td>{booking.dbd_records?.company_name_th ?? '—'}</td>
                    <td>
                      <StaffForm action={cancelBookingAction}>
                        <input type="hidden" name="appointmentId" value={booking.id} />
                        <button
                          type="submit"
                          data-testid={`cancel-${booking.id}`}
                          className="staff-btn-ghost staff-btn-sm"
                        >
                          {t('cancel')}
                        </button>
                      </StaffForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
