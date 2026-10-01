'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { displayLoginId, isValidSuffixFor } from '@/lib/domain/login-id';
import {
  checkLoginIdAction,
  suggestLoginIdAction,
  type LoginIdCheck,
  type LoginIdKind,
} from './login-id-actions';

type FieldState = 'idle' | 'checking' | LoginIdCheck;

/**
 * The typed part of a new account's code (D69): the prefix is fixed in front — T- for a
 * manager, the team's code and a hyphen for a learner — and the input starts with a free
 * suggestion the staff member may keep, replace with ↻, or overwrite. As they type, the field
 * says whether the code is free; the create action checks again, since nothing is reserved.
 *
 * Remount it (a `key`) to start again from a new `initialSuffix`: after a create, or when the
 * admin picks another team. While the new suggestion is on its way (`busy`) the input is held,
 * so nothing typed in that moment is overwritten when it lands.
 */
export function LoginIdField({
  kind,
  prefix,
  managerId,
  initialSuffix,
  busy = false,
}: {
  kind: LoginIdKind;
  /** The stored prefix, e.g. `t-` or `t-g4-`; null while the admin has not chosen a team. */
  prefix: string | null;
  /** The team the admin chose; a manager's own team is implied by the server. */
  managerId?: string;
  initialSuffix: string | null;
  busy?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.loginIdField');
  const id = useId();
  const [suffix, setSuffix] = useState((initialSuffix ?? '').toUpperCase());
  const [state, setState] = useState<FieldState>(
    busy ? 'checking' : initialSuffix ? 'available' : 'idle',
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the latest request may paint: an answer about what was typed a keystroke ago is stale.
  const latest = useRef(0);

  const check = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    const request = ++latest.current;
    if (!value) return setState('idle');
    if (!isValidSuffixFor(kind, value)) return setState('invalid');
    setState('checking');
    timer.current = setTimeout(async () => {
      const { state: answer } = await checkLoginIdAction({
        locale,
        kind,
        managerId,
        suffix: value,
      });
      if (request === latest.current) setState(answer);
    }, 300);
  };

  const suggest = async () => {
    if (timer.current) clearTimeout(timer.current);
    const request = ++latest.current;
    setState('checking');
    const { suffix: next } = await suggestLoginIdAction({ locale, kind, managerId });
    if (request !== latest.current) return;
    if (next) {
      setSuffix(next.toUpperCase());
      setState('available');
    } else setState('no-team');
  };

  const message: Record<FieldState, string | null> = {
    idle: null,
    checking: t('checking'),
    available: t('available'),
    taken: t('taken'),
    // A learner's code is two letters and two digits (D84); a manager's 2–6 letters or digits.
    invalid: t(kind === 'learner' ? 'invalidLearner' : 'invalid'),
    'no-team': t('noTeam'),
  };
  const tone =
    state === 'available' ? 'text-ok-600' : state === 'checking' ? 'text-ink-500' : 'text-bad-600';

  return (
    <div className="text-sm">
      <label htmlFor={id}>{t('label')}</label>
      <div className="mt-1 flex items-stretch gap-2">
        <div className="staff-input-group">
          <span data-testid="login-id-prefix" className="staff-input-affix font-mono">
            {prefix ? displayLoginId(prefix) : '—'}
          </span>
          <input
            id={id}
            name="loginSuffix"
            data-testid="login-suffix"
            value={suffix}
            onChange={(e) => {
              const value = e.target.value.toUpperCase();
              setSuffix(value);
              check(value.trim());
            }}
            required
            disabled={!prefix || busy}
            maxLength={kind === 'learner' ? 4 : 6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={prefix ? undefined : t('chooseTeam')}
            aria-invalid={state === 'taken' || state === 'invalid'}
            aria-describedby={`${id}-status ${id}-hint`}
            className="staff-input font-mono"
          />
        </div>
        <button
          type="button"
          onClick={suggest}
          disabled={!prefix || busy}
          data-testid="suggest-login-id"
          aria-label={t('suggest')}
          title={t('suggest')}
          className="staff-btn-ghost staff-btn-sm"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
      <p
        id={`${id}-status`}
        role="status"
        data-testid="login-id-status"
        data-state={state}
        className={`mt-1 min-h-6 ${tone}`}
      >
        {message[state]}
      </p>
      {/* 14px, not the 12px of older hints: Thai is never set below 14 (design brief). */}
      <span id={`${id}-hint`} className="block text-sm text-ink-500">
        {t(kind === 'learner' ? 'hintLearner' : 'hint')}
      </span>
    </div>
  );
}
