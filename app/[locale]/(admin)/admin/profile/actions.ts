'use server';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireStaffOrSubmanager } from '@/lib/auth/session';
import { publicEnv } from '@/lib/db/env';
import { createSupabaseServerClient } from '@/lib/db/server';
import { validateStaffPasswordChange, type StaffPasswordError } from '@/lib/domain/staff-password';

export type ChangePasswordState = {
  error: StaffPasswordError | 'invalidCurrent' | 'updateFailed' | null;
  success: boolean;
};

const inputSchema = z.object({
  locale: z.enum(['th', 'en', 'zh']),
  currentPassword: z.string(),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = inputSchema.safeParse({
    locale: formData.get('locale'),
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return { error: 'missing', success: false };

  const { locale, currentPassword, newPassword, confirmPassword } = parsed.data;
  const staff = await requireStaffOrSubmanager(locale);
  const validationError = validateStaffPasswordChange(
    currentPassword,
    newPassword,
    confirmPassword,
  );
  if (validationError) return { error: validationError, success: false };

  const sessionClient = await createSupabaseServerClient();
  const { data: authenticated, error: userError } = await sessionClient.auth.getUser();
  if (userError || !authenticated.user?.email || authenticated.user.id !== staff.id) {
    return { error: 'updateFailed', success: false };
  }

  // Verify the current password in an isolated, non-persistent client. Reusing the cookie-bound
  // client for signInWithPassword would replace the staff member's active session on failure.
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = publicEnv();
  const verificationClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verified, error: signInError } = await verificationClient.auth.signInWithPassword({
    email: authenticated.user.email,
    password: currentPassword,
  });
  await verificationClient.auth.signOut({ scope: 'local' });
  if (signInError || verified.user?.id !== staff.id) {
    return { error: 'invalidCurrent', success: false };
  }

  // Update through the browser's own session: Auth revokes every other session of the user on a
  // password change, so updating via the verification client signed the staff member out.
  const { error: updateError } = await sessionClient.auth.updateUser({ password: newPassword });
  if (updateError) return { error: 'updateFailed', success: false };
  return { error: null, success: true };
}
