'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  renameManagerAction,
  resetManagerPasswordAction,
  setManagerStatusAction,
  type ManagerState,
} from './actions';

const initial: ManagerState = { ok: false, error: null, createdLoginId: null };

export function ManagerRowControls({
  id,
  status,
  displayName,
}: {
  id: string;
  status: string;
  displayName: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.managers');
  const [statusState, statusAction, statusPending] = useActionState(
    setManagerStatusAction,
    initial,
  );
  const [pwState, pwAction, pwPending] = useActionState(resetManagerPasswordAction, initial);
  const [nameState, nameAction, namePending] = useActionState(renameManagerAction, initial);
  const next = status === 'disabled' ? 'active' : 'disabled';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={statusAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={next} />
        <button
          type="submit"
          disabled={statusPending}
          data-testid="toggle-status"
          className="text-xs underline disabled:opacity-50"
        >
          {next === 'disabled' ? t('disable') : t('enable')}
        </button>
      </form>
      <form action={nameAction} className="flex items-center gap-1">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <input
          name="displayName"
          defaultValue={displayName ?? ''}
          placeholder={t('displayName')}
          className="w-36 rounded border px-1 py-0.5 text-xs"
        />
        <button
          type="submit"
          disabled={namePending}
          data-testid="rename-manager"
          className="text-xs underline disabled:opacity-50"
        >
          {t('rename')}
        </button>
      </form>
      <form action={pwAction} className="flex items-center gap-1">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <input
          name="newPassword"
          type="password"
          minLength={10}
          placeholder={t('resetPassword')}
          className="w-36 rounded border px-1 py-0.5 text-xs"
        />
        <button
          type="submit"
          disabled={pwPending}
          data-testid="reset-password"
          className="text-xs underline disabled:opacity-50"
        >
          {t('resetPassword')}
        </button>
      </form>
      {(statusState.error ?? pwState.error ?? nameState.error) && (
        <span role="alert" className="text-xs text-red-700">
          {statusState.error ?? pwState.error ?? nameState.error}
        </span>
      )}
      {pwState.ok && <span className="text-xs text-green-700">{t('passwordUpdated')}</span>}
    </div>
  );
}
