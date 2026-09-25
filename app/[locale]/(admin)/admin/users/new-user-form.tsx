'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Link } from '@/i18n/navigation';
import { displayLoginId } from '@/lib/domain/login-id';
import { createUserAction, type CreateUserState } from './actions';

const initial: CreateUserState = { ok: false, error: null, createdLoginId: null, company: null };

/** A DBD record the picker offers; only confirmed ones can be chosen (the database enforces it). */
export type CompanyOption = {
  id: string;
  name: string;
  status: string;
  confirmed: boolean;
};

/**
 * Every account created here is a learner studying one company: the record chosen becomes the
 * learner's active assignment. Language is not asked — every learner has all three languages
 * and the switcher remembers the last choice.
 */
export type TeamOption = { id: string; code: string; name: string | null };

export function NewUserForm({
  companies,
  teams = null,
}: {
  companies: CompanyOption[];
  /** Null for a manager: they create inside their own team (spec §7). */
  teams?: TeamOption[] | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [state, formAction, pending] = useActionState(createUserAction, initial);
  const confirmed = companies.filter((c) => c.confirmed);
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold">{t('new')}</h2>
      {teams && (
        <label className="text-sm">
          {t('team')}
          {teams.length === 0 ? (
            <p data-testid="no-manager" className="text-sm text-amber-800">
              {t('noManager')}
            </p>
          ) : (
            <select name="managerId" required className="mt-1 w-full rounded border px-2 py-1">
              <option value="">{t('chooseTeam')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name ? `${team.code} — ${team.name}` : team.code}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="text"
          required
          minLength={10}
          autoComplete="off"
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>
      <label className="text-sm">
        {t('displayName')}
        <input name="displayName" className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="text-sm">
        {t('company')}
        <select
          name="dbdRecordId"
          required
          defaultValue=""
          className="mt-1 w-full rounded border px-2 py-1"
        >
          <option value="">{t('chooseCompany')}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.confirmed}>
              {c.confirmed ? c.name : t('unconfirmedCompany', { name: c.name, status: c.status })}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-gray-600">
          {confirmed.length === 0 ? (
            <>
              {t('noConfirmedCompany')}{' '}
              <Link href="/admin/dbd-records" className="underline">
                {t('goToRecords')}
              </Link>
            </>
          ) : (
            t('companyHint')
          )}
        </span>
      </label>
      {state.error && (
        <p role="alert" data-testid="create-user-error" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="create-user-status" className="text-sm text-green-700">
          {t('createdFor', {
            loginId: displayLoginId(state.createdLoginId),
            company: state.company ?? '',
          })}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || confirmed.length === 0}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('create')}
      </button>
    </form>
  );
}
