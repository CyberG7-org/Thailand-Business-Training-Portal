'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { displayLoginId } from '@/lib/domain/login-id';
import { createUserAction, type CreateUserState } from './actions';

const initial: CreateUserState = { ok: false, error: null, createdLoginId: null, company: null };

/** A DBD record the picker offers; only confirmed ones can be chosen (the database enforces it). */
export type CompanyOption = {
  /** The team that owns the record; null means it is the admin's own (spec §3.2). */
  teamId?: string | null;
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
export type TeamOption = {
  id: string;
  code: string;
  name: string | null;
  /** The code the next learner of this team gets (D66). */
  nextLoginId: string;
};

export function NewUserForm({
  companies,
  teams = null,
  nextLoginId = null,
}: {
  companies: CompanyOption[];
  /** Null for a manager: they create inside their own team (spec §7). */
  teams?: TeamOption[] | null;
  /** A manager's own team's next code; the admin's comes with the team chosen. */
  nextLoginId?: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [state, formAction, pending] = useActionState(createUserAction, initial);
  const [teamId, setTeamId] = useState('');
  // An admin choosing a team sees that team's companies and their own untied ones; a manager
  // (teams === null) sees whatever RLS already gave them.
  const offered = teams
    ? companies.filter((c) => !teamId || c.teamId === teamId || c.teamId == null)
    : companies;
  const confirmed = companies.filter((c) => c.confirmed);
  // Nobody types a login id: the form says which code the next learner gets (D66).
  const nextCode = teams
    ? (teams.find((team) => team.id === teamId)?.nextLoginId ?? null)
    : nextLoginId;
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold">{t('new')}</h2>
      {teams && (
        <label className="text-sm">
          {t('team')}
          {teams.length === 0 ? (
            <p data-testid="no-manager" className="text-sm text-warn-700">
              {t('noManager')}
            </p>
          ) : (
            <select
              name="managerId"
              required
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="staff-input mt-1"
            >
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
        {t('nextLoginId')}
        <input
          readOnly
          aria-readonly="true"
          tabIndex={-1}
          data-testid="next-login-id"
          value={nextCode ? displayLoginId(nextCode) : ''}
          placeholder={teams && !teamId ? t('nextLoginIdChooseTeam') : undefined}
          className="staff-input mt-1 font-mono"
        />
        <span className="mt-1 block text-xs text-ink-500">{t('nextLoginIdHint')}</span>
      </label>
      <label className="text-sm">
        {t('learnerName')}
        <input name="displayName" required maxLength={120} className="staff-input mt-1" />
      </label>
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="text"
          required
          minLength={10}
          autoComplete="off"
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('company')}
        <select name="dbdRecordId" required defaultValue="" className="staff-input mt-1">
          <option value="">{t('chooseCompany')}</option>
          {offered.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.confirmed}>
              {c.confirmed ? c.name : t('unconfirmedCompany', { name: c.name, status: c.status })}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-500">
          {confirmed.length === 0 ? (
            <>
              {t('noConfirmedCompany')}{' '}
              <Link href="/admin/dbd-records" className="staff-link">
                {t('goToRecords')}
              </Link>
            </>
          ) : (
            t('companyHint')
          )}
        </span>
      </label>
      {state.error && (
        <p role="alert" data-testid="create-user-error" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="create-user-status" className="text-sm text-ok-600">
          {t('createdFor', {
            loginId: displayLoginId(state.createdLoginId),
            company: state.company ?? '',
          })}
        </p>
      )}
      <button type="submit" disabled={pending || confirmed.length === 0} className="staff-btn">
        {t('create')}
      </button>
    </form>
  );
}
