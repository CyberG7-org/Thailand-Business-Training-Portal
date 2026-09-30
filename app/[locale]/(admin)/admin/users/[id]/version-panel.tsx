'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { confirmRoleAction, moveAssignmentAction, type VersionActionState } from './actions';

const initial: VersionActionState = { message: null, n: null, error: null };

/** The learner's pinned version and role confirmation (spec §5.6, D75). */
export function VersionPanel({
  userId,
  assignmentId,
  pinned,
  newest,
  roleConfirmedAt,
}: {
  userId: string;
  assignmentId: string;
  pinned: { n: number } | null;
  newest: { id: string; n: number } | null;
  roleConfirmedAt: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users.version');
  const format = useFormatter();
  const [moveState, moveAction, moving] = useActionState(moveAssignmentAction, initial);
  const [roleState, roleAction, confirming] = useActionState(confirmRoleAction, initial);
  const state = moveState.message || moveState.error ? moveState : roleState;
  const canMove = newest !== null && pinned?.n !== newest.n;
  return (
    <section
      className="staff-card grid max-w-md gap-3"
      data-testid="version-panel"
      data-pinned={pinned?.n ?? ''}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm" data-testid="version-pinned">
        {pinned ? t('pinned', { n: pinned.n }) : t('none')}
      </p>
      {newest && (
        <p className="text-sm text-ink-500" data-testid="version-newest">
          {canMove ? t('newer', { n: newest.n }) : t('current')}
        </p>
      )}
      {canMove && (
        <form action={moveAction} className="grid gap-1">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="versionId" value={newest.id} />
          <button
            type="submit"
            disabled={moving}
            className="staff-btn justify-self-start"
            data-testid="version-move"
          >
            {t('move', { n: newest.n })}
          </button>
          <p className="text-sm text-ink-500">{t('moveHint')}</p>
        </form>
      )}
      <p className="text-sm" data-testid="role-confirmation">
        {roleConfirmedAt
          ? t('roleConfirmed', {
              date: format.dateTime(new Date(roleConfirmedAt), { dateStyle: 'medium' }),
            })
          : t('roleUnconfirmed')}
      </p>
      {!roleConfirmedAt && pinned && (
        <form action={roleAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <button
            type="submit"
            disabled={confirming}
            className="staff-btn-ghost"
            data-testid="role-confirm"
          >
            {t('confirmRole')}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600" data-testid="version-error">
          {t.has(`errors.${state.error}`)
            ? t(`errors.${state.error}` as 'errors.not-found')
            : state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-ok-600" data-testid="version-message">
          {t(`messages.${state.message}` as 'messages.moved', { n: state.n ?? 0 })}
        </p>
      )}
    </section>
  );
}
