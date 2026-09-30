import 'server-only';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import type { LearnerContact } from '@/lib/domain/learner-contact';
import {
  MANAGER_PREFIX,
  isValidLoginSuffix,
  learnerPrefix,
  suggestionCandidates,
} from '@/lib/domain/login-id';
import { createSupabaseAdminClient } from './admin';
import { serverEnv } from './env';

/** One wording for a taken code, whether the pre-check or the auth service found it (D69). */
export const LOGIN_ID_TAKEN = 'This login ID is already taken — choose another';
export const LOGIN_SUFFIX_INVALID = 'A login ID takes 2–6 letters or digits';

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
    public readonly code: 'duplicate' | 'invalid' | 'invalid-login-id' | 'unknown' | 'no-manager',
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
    // Two staff typing the same code at the same moment both pass the pre-check; the auth
    // service's unique email refuses the second, which is told the same thing.
    if (/already|exists|registered/i.test(message)) {
      throw new ProvisioningError(LOGIN_ID_TAKEN, 'duplicate');
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

/** Everything the form can get wrong is checked before the auth service is asked. */
function parsePerson(input: NewPerson): z.infer<typeof newPersonSchema> {
  const parsed = newPersonSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProvisioningError(parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid');
  }
  return parsed.data;
}

/** Staff type only the part after the prefix; the prefix is always the server's (D69). */
function parseSuffix(suffix: string): string {
  const trimmed = suffix.trim();
  if (!isValidLoginSuffix(trimmed)) {
    throw new ProvisioningError(LOGIN_SUFFIX_INVALID, 'invalid-login-id');
  }
  return trimmed.toLowerCase();
}

/** The codes among these that an account already holds — active or disabled, any role. */
async function takenAmong(loginIds: string[]): Promise<Set<string>> {
  if (loginIds.length === 0) return new Set();
  const { data, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('login_id')
    .in(
      'login_id',
      loginIds.map((id) => id.toLowerCase()),
    );
  if (error) throw new ProvisioningError(error.message, 'unknown');
  return new Set((data ?? []).map((row) => row.login_id));
}

/**
 * Whether an account holds this code. Read with the service role, since a manager's RLS hides
 * other teams — the answer is one yes or no about a code under a prefix the caller may use. A
 * disabled account keeps its code; only an account deleted by hand frees one.
 */
export async function isLoginIdTaken(loginId: string): Promise<boolean> {
  return (await takenAmong([loginId])).has(loginId.toLowerCase());
}

/**
 * The learner prefix of a team: an active manager's whole code plus `-`. A suspended manager's
 * team is unreachable to everyone but the admin, so a learner created under one would have
 * nobody to manage them; the database trigger checks the role, not the status.
 */
export async function learnerPrefixOf(managerId: string): Promise<string> {
  const { data: manager } = await createSupabaseAdminClient()
    .from('profiles')
    .select('login_id, role, status')
    .eq('id', managerId)
    .maybeSingle();
  if (!manager || manager.role !== 'manager') {
    throw new ProvisioningError('That account is not a manager', 'no-manager');
  }
  if (manager.status !== 'active') {
    throw new ProvisioningError('That manager is suspended', 'no-manager');
  }
  return learnerPrefix(manager.login_id);
}

/**
 * A free suffix to prefill under a prefix: a batch of candidates checked in one query, one more
 * character whenever a length has nothing free left in the batch. Nothing is reserved — the
 * check at create is what counts.
 */
export async function suggestLoginSuffix(
  prefix: string,
  candidates: (count: number, length: number) => string[] = suggestionCandidates,
): Promise<string> {
  for (let length = 2; length <= 6; length++) {
    const offered = candidates(30, length);
    const taken = await takenAmong(offered.map((suffix) => prefix + suffix));
    const free = offered.find((suffix) => !taken.has(prefix + suffix));
    if (free) return free;
  }
  throw new ProvisioningError('No free login ID to suggest', 'unknown');
}

/**
 * Refuses a taken code before the auth service is asked, so the reason reads the same way. Two
 * creations racing for one code both pass that check; the loser's refusal comes back from the
 * auth service as a bare "Database error creating new user" (the unique index on the profile or
 * the email), so a refusal is looked at again: if the code is held now, that was the reason.
 */
async function createUnderCode(
  loginId: string,
  person: z.infer<typeof newPersonSchema> & { role: 'manager' | 'learner' },
  deps: Deps,
): Promise<{ id: string; loginId: string }> {
  if (await isLoginIdTaken(loginId)) throw new ProvisioningError(LOGIN_ID_TAKEN, 'duplicate');
  try {
    return await deps.createAccount({ ...person, loginId });
  } catch (e) {
    const duplicate = e instanceof ProvisioningError && e.code === 'duplicate';
    if (!duplicate && (await isLoginIdTaken(loginId))) {
      throw new ProvisioningError(LOGIN_ID_TAKEN, 'duplicate');
    }
    throw e;
  }
}

/** A manager is a team: `T-` plus the suffix the owner typed, which prefixes every learner. */
export async function createManagerAccount(
  input: NewPerson & { suffix: string },
  deps: Deps = { createAccount },
): Promise<{ id: string; loginId: string }> {
  const person = parsePerson(input);
  const suffix = parseSuffix(input.suffix);
  return createUnderCode(MANAGER_PREFIX + suffix, { ...person, role: 'manager' }, deps);
}

/** A learner's contact details as profile columns (D80). */
export function contactColumns(contact: LearnerContact) {
  return {
    phone: contact.phone,
    contact_email: contact.contactEmail,
    website: contact.website,
    facebook_page: contact.facebookPage,
  };
}

/**
 * A learner's code is their manager's code, `-`, and the suffix typed; they carry `manager_id`
 * so every team-scoped policy can find them. The profile is created by a trigger from the auth
 * user, so the team — and the contact details the manager gave (D80) — are set immediately
 * afterwards; `enforce_team_membership` rejects a non-manager parent.
 */
export async function createLearnerAccount(
  input: NewPerson & { managerId: string; suffix: string; contact?: LearnerContact },
  deps: Deps = { createAccount },
): Promise<{ id: string; loginId: string }> {
  const person = parsePerson(input);
  const suffix = parseSuffix(input.suffix);
  const prefix = await learnerPrefixOf(input.managerId);
  const created = await createUnderCode(prefix + suffix, { ...person, role: 'learner' }, deps);
  // `.select().single()` so a zero-row update is an error rather than a silent success: without
  // it a learner could be reported as created and belong to no team.
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      manager_id: input.managerId,
      ...(input.contact ? contactColumns(input.contact) : {}),
    })
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
