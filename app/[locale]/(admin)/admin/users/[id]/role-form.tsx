'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import { updateAssignmentRoleAction, type AccountActionState } from './actions';

const initial: AccountActionState = { message: null, error: null };

const FIXED = ['position', 'responsibilities', 'relationship_to_shareholders'] as const;
const LABEL = {
  position: 'position',
  responsibilities: 'responsibilities',
  relationship_to_shareholders: 'relationship',
} as const;

/**
 * The learner's own role in the assigned company (D39, D95): which person of the DBD documents
 * they are — the facts behind the bank's "your shares" and "your name" questions — and the
 * three answers that are the same for every learner, shown read-only. Only the name can be
 * changed, and only to a name printed in the documents.
 */
export function RoleForm({
  userId,
  assignmentId,
  role,
  picked,
  people,
}: {
  userId: string;
  assignmentId: string;
  /** The role as the learner is taught it (`withStandardRole`). */
  role: LearnerRole;
  /** Whether a person chose the name; otherwise it is the company's only director, or none. */
  picked: boolean;
  /** Names printed in the DBD documents (directors, then shareholders) to pick the learner from. */
  people: string[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.role');
  const tv = useTranslations('admin.users.version');
  const [state, formAction, pending] = useActionState(updateAssignmentRoleAction, initial);
  const name = role.holder_name ?? '';
  // A name typed before D95 that is not in the documents is still shown, so it can be replaced.
  const options = name && !people.includes(name) ? [name, ...people] : people;
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3" data-testid="role-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-xs text-ink-500">{t('hint')}</p>
      <label className="text-sm">
        {t('holderName')}
        <select
          name="holder_name"
          key={name}
          defaultValue={name}
          className="staff-input mt-1"
          data-testid="role-holder"
          data-automatic={!picked && name ? 'true' : 'false'}
        >
          {!name && <option value="">{t('choose')}</option>}
          {options.map((person) => (
            <option key={person} value={person}>
              {person}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-500">
          {people.length === 0 ? t('noPeople') : !picked && name ? t('automatic') : t('holderHint')}
        </span>
      </label>
      <dl className="grid gap-2 text-sm" data-testid="role-fixed">
        {FIXED.map((field) => (
          <div key={field}>
            <dt className="text-ink-500">{t(LABEL[field])}</dt>
            <dd data-testid={`role-${field}`} className="text-ink-900">
              {role[field]}
            </dd>
          </div>
        ))}
        <p className="text-xs text-ink-500">{t('fixed')}</p>
      </dl>
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {state.error === 'evaluation-in-progress'
            ? tv('errors.evaluation-in-progress')
            : state.error === 'name-not-in-dbd'
              ? t('nameNotInDbd')
              : state.error}
        </p>
      )}
      {state.message === 'role-saved' && (
        <p role="status" data-testid="role-saved" className="text-sm text-ok-600">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || people.length === 0}
        className="staff-btn justify-self-start"
      >
        {t('save')}
      </button>
    </form>
  );
}
