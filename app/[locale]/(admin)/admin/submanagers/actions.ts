'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth/session';
import { recordAccountAction } from '@/lib/db/account-audit';
import {
  archiveSubmanager,
  createSubmanagerAccount,
  resetSubmanagerPassword,
  setSubmanagerStatus,
  ProvisioningError,
} from '@/lib/db/provisioning';

export type SubmanagerState = { ok: boolean; error: string | null; createdLoginId: string | null };

/** All submitted IDs are targets only; the acting Manager comes from the session. */
export async function submanagerAction(
  _prev: SubmanagerState,
  form: FormData,
): Promise<SubmanagerState> {
  const locale = String(form.get('locale') ?? 'th');
  const actor = await requireManager(locale);
  const id = String(form.get('id') ?? '');
  const operation = String(form.get('operation') ?? '');
  let createdLoginId: string | null = null;
  try {
    if (operation === 'create') {
      const created = await createSubmanagerAccount({
        managerId: actor.id,
        suffix: String(form.get('suffix') ?? ''),
        password: String(form.get('password') ?? ''),
        displayName: String(form.get('displayName') ?? '') || undefined,
      });
      createdLoginId = created.loginId;
      await recordAccountAction(actor.id, 'create', created.id, {
        role: 'submanager',
        manager_id: actor.id,
        login_id: created.loginId,
      });
    } else if (operation === 'status') {
      const status = String(form.get('status'));
      if (status !== 'active' && status !== 'disabled') throw new Error('Invalid status');
      await setSubmanagerStatus(actor.id, id, status);
      await recordAccountAction(actor.id, 'status', id, { status });
    } else if (operation === 'password') {
      await resetSubmanagerPassword(actor.id, id, String(form.get('password') ?? ''));
      await recordAccountAction(actor.id, 'password', id);
    } else if (operation === 'archive') {
      await archiveSubmanager(actor.id, id);
      await recordAccountAction(actor.id, 'delete', id, { archived: true });
    } else throw new Error('Invalid operation');
    revalidatePath(`/${locale}/admin/submanagers`);
    return { ok: true, error: null, createdLoginId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ProvisioningError ? error.message : 'Unexpected error',
      createdLoginId: null,
    };
  }
}
