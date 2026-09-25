'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { recordAccountAction } from '@/lib/db/account-audit';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import {
  ProvisioningError,
  createManagerAccount,
  setAccountPassword,
  setAccountStatus,
} from '@/lib/db/provisioning';

export type ManagerState = { ok: boolean; error: string | null; createdLoginId: string | null };

const fail = (error: string): ManagerState => ({ ok: false, error, createdLoginId: null });

/** Only the admin creates managers (spec §4). The code is allocated, never typed. */
export async function createManagerAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);
  try {
    const displayName = String(formData.get('displayName') ?? '') || undefined;
    const created = await createManagerAccount({
      password: String(formData.get('password') ?? ''),
      displayName,
    });
    await recordAccountAction(admin.id, 'create', created.id, {
      role: 'manager',
      login_id: created.loginId,
      display_name: displayName ?? null,
    });
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: created.loginId };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}

export async function setManagerStatusAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);
  const status = String(formData.get('status') ?? '') === 'disabled' ? 'disabled' : 'active';
  const id = String(formData.get('id') ?? '');
  try {
    await setAccountStatus(id, status);
    await recordAccountAction(admin.id, 'status', id, { status });
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}

/**
 * Spec §7: a team is handed to a successor by re-enabling the account, setting a new password and
 * changing the display name. The code, its learners and its records stay put.
 */
export async function renameManagerAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return fail('A holder name is required');
  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', String(formData.get('id') ?? ''))
    .eq('role', 'manager')
    .select('id')
    .single();
  if (error) return fail(error.message);
  await recordAccountAction(admin.id, 'rename', String(formData.get('id') ?? ''), {
    display_name: displayName,
  });
  revalidatePath(`/${locale}/admin/managers`);
  return { ok: true, error: null, createdLoginId: null };
}

export async function resetManagerPasswordAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);
  try {
    const id = String(formData.get('id') ?? '');
    await setAccountPassword(id, String(formData.get('newPassword') ?? ''));
    await recordAccountAction(admin.id, 'password', id);
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}
