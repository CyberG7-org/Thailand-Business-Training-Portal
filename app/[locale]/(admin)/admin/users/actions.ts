'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { ProvisioningError, createAccount } from '@/lib/db/provisioning';

export type CreateUserState = { ok: boolean; error: string | null; createdLoginId: string | null };

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  try {
    const { loginId } = await createAccount({
      loginId: String(formData.get('loginId') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: formData.get('role') === 'admin' ? 'admin' : 'learner',
      displayName: String(formData.get('displayName') ?? '') || undefined,
      preferredLanguage: (formData.get('preferredLanguage') as 'th' | 'en' | 'zh') ?? 'th',
    });
    revalidatePath(`/${locale}/admin/users`);
    return { ok: true, error: null, createdLoginId: loginId };
  } catch (e) {
    const message = e instanceof ProvisioningError ? e.message : 'Unexpected error';
    return { ok: false, error: message, createdLoginId: null };
  }
}
