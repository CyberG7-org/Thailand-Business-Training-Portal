'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import { updateAssignmentRoleAction, type AccountActionState } from './actions';

const initial: AccountActionState = { message: null, error: null };

/**
 * The learner's own role in the assigned company (decision D39): which director/shareholder
 * they are, their position, duties and relationship — the facts behind "your shares", "your
 * position" questions the bank asks.
 */
export function RoleForm({
  userId,
  assignmentId,
  role,
  people,
}: {
  userId: string;
  assignmentId: string;
  role: LearnerRole;
  /** Names printed in the DBD documents (directors ∪ shareholders) to pick the learner from. */
  people: string[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.role');
  const [state, formAction, pending] = useActionState(updateAssignmentRoleAction, initial);
  const inputClass = 'mt-1 w-full rounded border px-2 py-1';
  return (
    <form
      action={formAction}
      className="grid max-w-md gap-3 rounded border p-4"
      data-testid="role-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-xs text-gray-600">{t('hint')}</p>
      <label className="text-sm">
        {t('holderName')}
        <input
          name="holder_name"
          list="dbd-people"
          defaultValue={role.holder_name ?? ''}
          className={inputClass}
          data-testid="role-holder"
        />
        <datalist id="dbd-people">
          {people.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span className="text-xs text-gray-500">{t('holderHint')}</span>
      </label>
      <label className="text-sm">
        {t('position')}
        <input name="position" defaultValue={role.position ?? ''} className={inputClass} />
      </label>
      <label className="text-sm">
        {t('responsibilities')}
        <textarea
          name="responsibilities"
          rows={2}
          defaultValue={role.responsibilities ?? ''}
          className={inputClass}
        />
      </label>
      <label className="text-sm">
        {t('relationship')}
        <textarea
          name="relationship_to_shareholders"
          rows={2}
          defaultValue={role.relationship_to_shareholders ?? ''}
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message === 'role-saved' && (
        <p role="status" data-testid="role-saved" className="text-sm text-green-700">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('save')}
      </button>
    </form>
  );
}
