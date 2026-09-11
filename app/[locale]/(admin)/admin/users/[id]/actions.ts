'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { ProvisioningError, setAccountPassword, setAccountStatus } from '@/lib/db/provisioning';

export type AccountActionState = { message: string | null; error: string | null };

export async function resetPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  await requireAdmin(locale);
  try {
    await setAccountPassword(userId, String(formData.get('password') ?? ''));
    return { message: 'password-updated', error: null };
  } catch (e) {
    return {
      message: null,
      error: e instanceof ProvisioningError ? e.message : 'Unexpected error',
    };
  }
}

export async function setStatusAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const status = formData.get('status') === 'disabled' ? 'disabled' : 'active';
  const admin = await requireAdmin(locale);
  if (admin.id === userId && status === 'disabled') {
    return { message: null, error: 'You cannot disable your own account' };
  }
  try {
    await setAccountStatus(userId, status);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'status-updated', error: null };
  } catch (e) {
    return {
      message: null,
      error: e instanceof ProvisioningError ? e.message : 'Unexpected error',
    };
  }
}
