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
  role: z.enum(['learner', 'manager', 'admin']).default('learner'),
  displayName: z.string().trim().max(120).optional(),
  preferredLanguage: z.enum(['th', 'en', 'zh']).default('th'),
});
export type NewAccountInput = z.input<typeof newAccountSchema>;

export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly code: 'duplicate' | 'invalid' | 'unknown' | 'no-manager',
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

type NewPerson = {
  password: string;
  displayName?: string;
  preferredLanguage?: 'th' | 'en' | 'zh';
};

/** The auth call behind a code; tests substitute it to make the auth service refuse. */
type Deps = { createAccount: typeof createAccount };

const newPersonSchema = newAccountSchema.omit({ loginId: true, role: true });

/**
 * Everything the form can get wrong is checked before a code is taken: a rejected password used
 * to cost a team its number (the first manager on staging came out as T02).
 */
function parsePerson(input: NewPerson): z.infer<typeof newPersonSchema> {
  const parsed = newPersonSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProvisioningError(parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid');
  }
  return parsed.data;
}

/** One round trip to the counter; it serialises on its own row, so concurrent callers queue. */
async function allocate(scope: string, prefix: string): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().rpc('allocate_login_id', {
    p_scope: scope,
    p_prefix: prefix,
  });
  if (error || !data) throw new ProvisioningError(error?.message ?? 'No code allocated', 'unknown');
  return data as string;
}

/**
 * Hands a number back when no account came of it. The database takes it only while it is still
 * the latest one issued, so nothing allocated in between is crossed. A failure here leaves a
 * gap, which the caller's own error already explains, so it is not raised.
 */
async function release(scope: string, prefix: string, loginId: string): Promise<void> {
  await createSupabaseAdminClient().rpc('release_login_id', {
    p_scope: scope,
    p_value: Number.parseInt(loginId.slice(prefix.length), 10),
  });
}

/**
 * Takes the next code and creates the account under it. A code is spent only by an account that
 * exists — except when the refusal is that the code is already taken, where handing it back
 * would issue the same code on every retry.
 */
async function createUnderNextCode(
  scope: string,
  prefix: string,
  person: z.infer<typeof newPersonSchema> & { role: 'manager' | 'learner' },
  deps: Deps,
): Promise<{ id: string; loginId: string }> {
  const loginId = await allocate(scope, prefix);
  try {
    return await deps.createAccount({ ...person, loginId });
  } catch (e) {
    if (!(e instanceof ProvisioningError && e.code === 'duplicate')) {
      await release(scope, prefix, loginId);
    }
    throw e;
  }
}

/**
 * A manager is a team. Their code comes from the one global counter and becomes the prefix every
 * learner of theirs is numbered under (spec §3.3).
 */
export async function createManagerAccount(
  input: NewPerson,
  deps: Deps = { createAccount },
): Promise<{ id: string; loginId: string }> {
  const person = parsePerson(input);
  return createUnderNextCode('manager', 't', { ...person, role: 'manager' }, deps);
}

/**
 * A learner is numbered inside their manager's team, and carries `manager_id` so every
 * team-scoped policy can find them. The profile is created by a trigger from the auth user, so
 * the team is set immediately afterwards; `enforce_team_membership` rejects a non-manager parent.
 */
export async function createLearnerAccount(
  input: NewPerson & { managerId: string },
  deps: Deps = { createAccount },
): Promise<{ id: string; loginId: string }> {
  const person = parsePerson(input);
  const admin = createSupabaseAdminClient();
  const { data: manager } = await admin
    .from('profiles')
    .select('login_id, role, status')
    .eq('id', input.managerId)
    .maybeSingle();
  if (!manager || manager.role !== 'manager') {
    throw new ProvisioningError('That account is not a manager', 'no-manager');
  }
  // A suspended manager's team is unreachable to everyone but the admin, so a learner created
  // under one would have nobody to manage them. The trigger checks the role, not the status.
  if (manager.status !== 'active') {
    throw new ProvisioningError('That manager is suspended', 'no-manager');
  }
  const created = await createUnderNextCode(
    input.managerId,
    `${manager.login_id}-`,
    { ...person, role: 'learner' },
    deps,
  );
  // `.select().single()` so a zero-row update is an error rather than a silent success: without
  // it a learner could be reported as created and belong to no team.
  const { error } = await admin
    .from('profiles')
    .update({ manager_id: input.managerId })
    .eq('id', created.id)
    .select('id')
    .single();
  if (error) {
    // Undo the auth account, or "creation failed" would leave a working sign-in behind.
    await admin.auth.admin.deleteUser(created.id);
    throw new ProvisioningError(error.message, 'unknown');
  }
  return created;
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
