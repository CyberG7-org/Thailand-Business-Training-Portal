import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { listAppointmentsForStaff, listBlocks } from '@/lib/db/appointments';
import { createSupabaseServerClient } from '@/lib/db/server';
import { bangkokDateOf, bangkokTimeLabel } from '@/lib/domain/appointments/slots';
import { displayLoginId } from '@/lib/domain/login-id';
import { formatDate, todayInBangkok } from '@/lib/domain/thai-date';
import { blockAction, cancelBookingAction, unblockAction } from './actions';
import { StaffForm } from './staff-form';

const inputClass = 'rounded border px-2 py-1';

/**
 * Upcoming bookings by day for the caller's team (spec §5.3) — every team for the admin, with a
 * filter — plus the hours the manager has blocked and a form to block more.
 */
export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const [{ locale }, { team }] = await Promise.all([params, searchParams]);
  const staff = await requireStaff(locale);
  const loc = locale as AppLocale;
  const [db, t] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations('admin.appointments'),
  ]);
  const from = todayInBangkok();
  // A manager sees their own calendar; the admin picks one, "admin" being learners with no manager.
  const teamId: string | null | undefined =
    staff.role === 'manager' ? staff.id : team === 'admin' ? null : team ? team : undefined;
  const [bookings, blocks, managers] = await Promise.all([
    listAppointmentsForStaff(db, { teamId, from }),
    teamId === undefined ? [] : listBlocks(db, { teamId, from }),
    staff.role === 'admin'
      ? db
          .from('profiles')
          .select('id, login_id, display_name')
          .eq('role', 'manager')
          .eq('status', 'active')
          .order('login_id')
      : { data: null },
  ]);
  const managerCode = (id: string | null) => {
    if (!id) return t('adminCalendar');
    const m = (managers.data ?? []).find((row) => row.id === id);
    return m ? displayLoginId(m.login_id) : '—';
  };
  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const day = bangkokDateOf(b.starts_at);
    byDay.set(day, [...(byDay.get(day) ?? []), b]);
  }

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-700">{t('intro')}</p>
      </div>

      {staff.role === 'admin' && (
        <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="team-filter">{t('teamFilter')}</label>
          <select
            id="team-filter"
            name="team"
            data-testid="team-filter"
            defaultValue={team ?? ''}
            className={inputClass}
          >
            <option value="">{t('allTeams')}</option>
            <option value="admin">{t('adminCalendar')}</option>
            {(managers.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {displayLoginId(m.login_id)}
                {m.display_name ? ` · ${m.display_name}` : ''}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border px-3 py-1">
            {t('show')}
          </button>
        </form>
      )}

      {bookings.length === 0 ? (
        <p data-testid="admin-appointments-empty" className="text-sm text-gray-700">
          {t('empty')}
        </p>
      ) : (
        <div className="grid gap-4">
          {[...byDay.entries()].map(([day, rows]) => (
            <section key={day} className="grid gap-2">
              <h2 className="font-semibold">{formatDate(day, loc)}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3">{t('time')}</th>
                      <th className="pr-3">{t('learner')}</th>
                      <th className="pr-3">{t('company')}</th>
                      {staff.role === 'admin' && <th className="pr-3">{t('team')}</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => (
                      <tr
                        key={b.id}
                        data-testid={'admin-appointment-' + b.id}
                        className="border-b align-top"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                          {bangkokTimeLabel(b.starts_at)}–{bangkokTimeLabel(b.ends_at)}
                        </td>
                        <td className="pr-3">
                          {displayLoginId(b.profiles.login_id)}
                          {b.profiles.display_name ? ' · ' + b.profiles.display_name : ''}
                        </td>
                        <td className="pr-3">{b.dbd_records?.company_name_th ?? '—'}</td>
                        {staff.role === 'admin' && (
                          <td className="pr-3">{managerCode(b.team_id)}</td>
                        )}
                        <td>
                          <StaffForm action={cancelBookingAction}>
                            <input type="hidden" name="appointmentId" value={b.id} />
                            <button
                              type="submit"
                              data-testid={'cancel-' + b.id}
                              className="rounded border px-3 py-1 text-xs"
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
            </section>
          ))}
        </div>
      )}

      {teamId !== undefined && (
        <section className="grid gap-3">
          <h2 className="font-semibold">{t('blocks')}</h2>
          {blocks.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  data-testid={'block-' + b.id}
                  className="flex flex-wrap items-center gap-3 border-b py-1"
                >
                  <span className="tabular-nums">
                    {formatDate(bangkokDateOf(b.starts_at), loc)} {bangkokTimeLabel(b.starts_at)}–
                    {bangkokTimeLabel(b.ends_at)}
                  </span>
                  <span className="text-gray-700">{b.reason ?? ''}</span>
                  <StaffForm action={unblockAction}>
                    <input type="hidden" name="blockId" value={b.id} />
                    <button
                      type="submit"
                      data-testid={'unblock-' + b.id}
                      className="rounded border px-2 py-0.5 text-xs"
                    >
                      {t('unblock')}
                    </button>
                  </StaffForm>
                </li>
              ))}
            </ul>
          )}
          <StaffForm
            action={blockAction}
            testId="block-form"
            className="flex flex-wrap items-end gap-2 text-sm"
          >
            <input type="hidden" name="team" value={team ?? ''} />
            <label className="grid gap-0.5">
              {t('date')}
              <input type="date" name="date" required className={inputClass} />
            </label>
            <label className="grid gap-0.5">
              {t('fromHour')}
              <input
                type="number"
                name="fromHour"
                min={0}
                max={23}
                required
                className={inputClass + ' w-20'}
              />
            </label>
            <label className="grid gap-0.5">
              {t('toHour')}
              <input
                type="number"
                name="toHour"
                min={1}
                max={24}
                required
                className={inputClass + ' w-20'}
              />
            </label>
            <label className="grid gap-0.5">
              {t('reason')}
              <input type="text" name="reason" maxLength={200} className={inputClass} />
            </label>
            <button type="submit" className="rounded border px-3 py-1">
              {t('block')}
            </button>
          </StaffForm>
        </section>
      )}
    </section>
  );
}
