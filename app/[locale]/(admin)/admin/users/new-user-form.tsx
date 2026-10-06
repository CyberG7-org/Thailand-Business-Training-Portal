'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  useActionState,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { displayLoginId, learnerPrefix } from '@/lib/domain/login-id';
import {
  MIN_PASSWORD_LENGTH,
  generatePassword,
  newLearnerChecklist,
  type NewLearnerValues,
} from '@/lib/domain/new-learner';
import { suggestLoginIdAction } from '../login-id-actions';
import { LoginIdField } from '../login-id-field';
import { createUserAction, type CreateUserState } from './actions';
import { LearnerContactFields } from './learner-contact-fields';

const initial: CreateUserState = { ok: false, error: null, createdLoginId: null, company: null };

/** A DBD record the picker offers; only confirmed ones can be chosen (the database enforces it). */
export type CompanyOption = {
  /** The team that owns the record; null means it is the admin's own (spec §3.2). */
  teamId?: string | null;
  id: string;
  name: string;
  status: string;
  confirmed: boolean;
  /** It already has its learner: one per company (D93). */
  taken: boolean;
};

/** What the companies tab may ask of the form: choose a company, as "Assign learner" does. */
export type NewUserFormHandle = { assign: (companyId: string) => void };

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

const NOTHING_TYPED: NewLearnerValues = {
  team: '',
  company: '',
  password: '',
  name: '',
  phone: '',
  email: '',
  emailValid: false,
};

/**
 * "Create learner": the sign-in, the learner and their name-card details on the left, in
 * sections; on the right the company they study and a "Before you create" list that wakes the
 * button once everything required is there. The server checks it all again.
 */
export function NewUserForm({
  companies,
  teams = null,
  ownLoginId = null,
  initialSuffix = null,
  ref,
  onAddCompany,
}: {
  companies: CompanyOption[];
  /** Null for a manager: they create inside their own team (spec §7). */
  teams?: TeamOption[] | null;
  /** A manager's own code; the admin's prefix comes with the team chosen. */
  ownLoginId?: string | null;
  /** A free suffix for a manager's own team; the admin's arrives once a team is chosen. */
  initialSuffix?: string | null;
  /** Lets "Assign learner" on the companies tab choose a company here. */
  ref?: Ref<NewUserFormHandle>;
  /** "Not listed?": open the companies tab at its upload form. */
  onAddCompany: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [teamId, setTeamId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      // The code just created is taken now, so a success brings the next suggestion (D69); the
      // company is taken too (D93), so the choice empties.
      if (next.createdLoginId) {
        setCompanyId('');
        await refreshSuggestion(teams ? teamId : undefined);
      }
      return next;
    },
    initial,
  );

  // The list is read from the form itself rather than mirrored in state, so a value typed before
  // the page woke up still counts, and so does the reset after a learner is created.
  const [checklist, setChecklist] = useState(() =>
    newLearnerChecklist(NOTHING_TYPED, { needsTeam: Boolean(teams) }),
  );
  const recompute = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    const email = field('contactEmail');
    setChecklist(
      newLearnerChecklist(
        {
          team: teamId,
          company: field('dbdRecordId')?.value ?? '',
          password: field('password')?.value ?? '',
          name: field('displayName')?.value ?? '',
          phone: field('phone')?.value ?? '',
          email: email?.value ?? '',
          emailValid: email?.validity.valid ?? false,
        },
        { needsTeam: Boolean(teams) },
      ),
    );
  }, [teamId, teams]);
  useEffect(recompute, [recompute, state, companyId]);

  // "Assign learner" on a company: that company chosen, and for the owner its team as well.
  useImperativeHandle(ref, () => ({
    assign(id: string) {
      const company = companies.find((c) => c.id === id);
      if (!company) return;
      if (teams && company.teamId && company.teamId !== teamId) {
        setTeamId(company.teamId);
        void refreshSuggestion(company.teamId);
      }
      setCompanyId(company.id);
    },
  }));

  // An admin choosing a team sees that team's companies and their own untied ones; a manager
  // (teams === null) sees whatever RLS already gave them.
  const offeredFor = (team: string) =>
    teams ? companies.filter((c) => !team || c.teamId === team || c.teamId == null) : companies;
  const offered = offeredFor(teamId);
  const confirmed = companies.filter((c) => c.confirmed);
  // A company is given once (D93): confirmed and still without a learner.
  const free = confirmed.filter((c) => !c.taken);
  const teamLoginId = teams
    ? (teams.find((team) => team.id === teamId)?.loginId ?? null)
    : ownLoginId;
  const ready = checklist.every((c) => c.done);
  const label = 'font-semibold text-ink-900';

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={recompute}
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <input type="hidden" name="locale" value={locale} />

      <div className="staff-card divide-y divide-ink-100 p-0 md:p-0">
        <section className="grid gap-4 p-4 md:px-6 md:py-5">
          <div>
            <h3 className="text-base font-semibold text-ink-900">{t('signIn')}</h3>
            <p className="text-sm text-ink-500">{t('signInIntro')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <LoginIdField
              key={suggestion.version}
              kind="learner"
              compact
              prefix={teamLoginId ? learnerPrefix(teamLoginId) : null}
              managerId={teams ? teamId || undefined : undefined}
              initialSuffix={suggestion.suffix}
              busy={suggestion.busy}
            />
            <div className="text-sm">
              <label htmlFor="new-learner-password" className={label}>
                {t('password')}
              </label>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  ref={passwordRef}
                  id="new-learner-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder={t('passwordPlaceholder')}
                  className="staff-input min-w-0 flex-1"
                />
                <button
                  type="button"
                  data-testid="generate-password"
                  onClick={() => {
                    if (!passwordRef.current) return;
                    passwordRef.current.value = generatePassword();
                    // A generated password is for handing over, so it is shown.
                    setShowPassword(true);
                    recompute();
                  }}
                  className="staff-btn-ghost shrink-0 px-4 text-brand-600"
                >
                  {t('generatePassword')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="mt-1 min-h-6 text-sm text-brand-600 hover:text-brand-700 hover:underline"
              >
                {showPassword ? t('hidePassword') : t('showPassword')}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 p-4 md:px-6 md:py-5">
          <h3 className="text-base font-semibold text-ink-900">{t('learnerSection')}</h3>
          <label className="text-sm">
            <span className={label}>{t('name')}</span>
            <input
              name="displayName"
              required
              maxLength={120}
              placeholder={t('namePlaceholder')}
              className="staff-input mt-1"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <LearnerContactFields only={['phone', 'contactEmail']} strong />
          </div>
        </section>
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-6">
        <div className="staff-card grid gap-3">
          {teams && (
            <label className="text-sm">
              <span className={label}>{t('team')}</span>
              {teams.length === 0 ? (
                <p data-testid="no-manager" className="mt-1 text-sm text-warn-700">
                  {t('noManager')}
                </p>
              ) : (
                <select
                  name="managerId"
                  required
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value);
                    // A company the new team may not take is let go rather than kept hidden.
                    if (!offeredFor(e.target.value).some((c) => c.id === companyId)) {
                      setCompanyId('');
                    }
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
          <label className="text-sm">
            <span className={label}>{t('companyCard')}</span>
            <select
              name="dbdRecordId"
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="staff-input mt-1"
            >
              <option value="">{t('chooseConfirmedCompany')}</option>
              {offered.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.confirmed || c.taken}>
                  {!c.confirmed
                    ? t('unconfirmedCompany', { name: c.name, status: c.status })
                    : c.taken
                      ? t('takenCompany', { name: c.name })
                      : c.name}
                </option>
              ))}
            </select>
          </label>
          {confirmed.length === 0 ? (
            <p className="text-sm text-warn-700">{t('noConfirmedCompany')}</p>
          ) : (
            free.length === 0 && (
              <p data-testid="no-free-company" className="text-sm text-warn-700">
                {t('noFreeCompany')}
              </p>
            )
          )}
          <p className="text-sm text-ink-500">
            {t('notListed')}{' '}
            <button type="button" onClick={onAddCompany} className="staff-link">
              {t('addInCompanies')}
            </button>
          </p>
        </div>

        <div className="staff-card grid gap-3">
          <p className="text-sm font-semibold text-ink-900">{t('checklist.title')}</p>
          <ul className="grid gap-2" data-testid="create-checklist">
            {checklist.map(({ item, done }) => (
              <li
                key={item}
                data-testid={`check-${item}`}
                data-done={done}
                className="flex min-h-6 items-center gap-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors ${
                    done ? 'bg-ok-600 text-white' : 'bg-ink-100 ring-1 ring-ink-300 ring-inset'
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor">
                      <path d="M3.5 8.5l3 3 6-7" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <span className={done ? 'text-ink-900' : 'text-ink-500'}>
                  {t(`checklist.${item}`)}
                </span>
                <span className="sr-only">{done ? t('checklist.done') : t('checklist.todo')}</span>
              </li>
            ))}
          </ul>
          {state.error && (
            <p role="alert" data-testid="create-user-error" className="text-sm text-bad-600">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" data-testid="create-user-status" className="staff-notice-ok">
              {t('createdFor', {
                loginId: displayLoginId(state.createdLoginId),
                company: state.company ?? '',
              })}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !ready || free.length === 0}
            className="staff-btn w-full disabled:bg-ink-100 disabled:text-ink-500 disabled:opacity-100"
          >
            {t('createLearner')}
          </button>
        </div>
      </aside>
    </form>
  );
}
