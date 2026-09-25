'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
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
  await requireAdmin(locale);
  try {
    const created = await createManagerAccount({
      password: String(formData.get('password') ?? ''),
      displayName: String(formData.get('displayName') ?? '') || undefined,
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
  await requireAdmin(locale);
  const status = String(formData.get('status') ?? '') === 'disabled' ? 'disabled' : 'active';
  try {
    await setAccountStatus(String(formData.get('id') ?? ''), status);
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}

export async function resetManagerPasswordAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  try {
    await setAccountPassword(
      String(formData.get('id') ?? ''),
      String(formData.get('newPassword') ?? ''),
    );
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}
