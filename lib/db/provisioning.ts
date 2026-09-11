import 'server-only';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import { createSupabaseAdminClient } from './admin';
import { serverEnv } from './env';

export const newAccountSchema = z.object({
  loginId: z
    .string()
    .trim()
    .refine(isValidLoginId, 'Login ID must be 3–64 letters, digits, ".", "_" or "-"'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  role: z.enum(['learner', 'admin']).default('learner'),
  displayName: z.string().trim().max(120).optional(),
  preferredLanguage: z.enum(['th', 'en', 'zh']).default('th'),
});
export type NewAccountInput = z.input<typeof newAccountSchema>;

export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly code: 'duplicate' | 'invalid' | 'unknown',
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

/** Admin-only. Creates the auth user; database triggers create and role-sync the profile. */
export async function createAccount(
  input: NewAccountInput,
): Promise<{ id: string; loginId: string }> {
  const parsed = newAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProvisioningError(parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid');
  }
  const { loginId, password, role, displayName, preferredLanguage } = parsed.data;
  const normalizedLoginId = loginId.toLowerCase();

  const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({
    email: loginIdToEmail(normalizedLoginId, serverEnv().APP_INTERNAL_EMAIL_DOMAIN),
    password,
    email_confirm: true,
    user_metadata: {
      login_id: normalizedLoginId,
      display_name: displayName ?? null,
      preferred_language: preferredLanguage,
      role,
    },
    app_metadata: { role },
  });
  if (error || !data.user) {
    const message = error?.message ?? 'createUser returned no user';
    if (/already|exists|registered/i.test(message)) {
      throw new ProvisioningError('Login ID already exists', 'duplicate');
    }
    throw new ProvisioningError(message, 'unknown');
  }
  return { id: data.user.id, loginId: normalizedLoginId };
}

export async function setAccountPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 10) {
    throw new ProvisioningError('Password must be at least 10 characters', 'invalid');
  }
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw new ProvisioningError(error.message, 'unknown');
}

/** Disabling bans the auth user (blocks sign-in and token refresh) and marks the profile. */
export async function setAccountStatus(
  userId: string,
  status: 'active' | 'disabled',
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === 'disabled' ? '876600h' : 'none',
  });
  if (authError) throw new ProvisioningError(authError.message, 'unknown');
  const { error } = await admin.from('profiles').update({ status }).eq('id', userId);
  if (error) throw new ProvisioningError(error.message, 'unknown');
}
