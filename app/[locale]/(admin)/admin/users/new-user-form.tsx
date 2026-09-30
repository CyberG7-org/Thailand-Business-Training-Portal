'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { displayLoginId, learnerPrefix } from '@/lib/domain/login-id';
import { suggestLoginIdAction } from '../login-id-actions';
import { LoginIdField } from '../login-id-field';
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
  /** The manager's stored code, which prefixes every learner of the team (D69). */
  loginId: string;
};

export function NewUserForm({
  companies,
  teams = null,
  ownLoginId = null,
  initialSuffix = null,
}: {
  companies: CompanyOption[];
  /** Null for a manager: they create inside their own team (spec §7). */
  teams?: TeamOption[] | null;
  /** A manager's own code; the admin's prefix comes with the team chosen. */
  ownLoginId?: string | null;
  /** A free suffix for a manager's own team; the admin's arrives once a team is chosen. */
  initialSuffix?: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [teamId, setTeamId] = useState('');
  const [suggestion, setSuggestion] = useState({
    suffix: initialSuffix,
    busy: false,
    version: 0,
  });
  // Only the latest request may land: an admin flicking between teams must not end up with a
  // suggestion made for the team they left.
  const latest = useRef(0);
  const refreshSuggestion = async (managerId: string | undefined) => {
    const request = ++latest.current;
    const wanted = !teams || Boolean(managerId);
    // Held empty until this team's suggestion lands, never showing the last team's code.
    setSuggestion((s) => ({ suffix: null, busy: wanted, version: s.version + 1 }));
    if (!wanted) return;
    const { suffix } = await suggestLoginIdAction({ locale, kind: 'learner', managerId });
    if (request === latest.current) {
      setSuggestion((s) => ({ suffix, busy: false, version: s.version + 1 }));
    }
  };
  const [state, formAction, pending] = useActionState(
    async (prev: CreateUserState, formData: FormData) => {
      const next = await createUserAction(prev, formData);
      // The code just created is taken now, so a success brings the next suggestion (D69).
      if (next.createdLoginId) await refreshSuggestion(teams ? teamId : undefined);
      return next;
    },
    initial,
  );
  // An admin choosing a team sees that team's companies and their own untied ones; a manager
  // (teams === null) sees whatever RLS already gave them.
  const offered = teams
    ? companies.filter((c) => !teamId || c.teamId === teamId || c.teamId == null)
    : companies;
  const confirmed = companies.filter((c) => c.confirmed);
  const teamLoginId = teams
    ? (teams.find((team) => team.id === teamId)?.loginId ?? null)
    : ownLoginId;
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
              onChange={(e) => {
                setTeamId(e.target.value);
                void refreshSuggestion(e.target.value || undefined);
              }}
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
      <LoginIdField
        key={suggestion.version}
        kind="learner"
        prefix={teamLoginId ? learnerPrefix(teamLoginId) : null}
        managerId={teams ? teamId || undefined : undefined}
        initialSuffix={suggestion.suffix}
        busy={suggestion.busy}
      />
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
