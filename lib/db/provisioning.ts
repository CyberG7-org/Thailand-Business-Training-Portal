import 'server-only';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import {
  isValidPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '@/lib/domain/password-policy';
import type { LearnerContact } from '@/lib/domain/learner-contact';
import {
  MANAGER_PREFIX,
  allSuffixes,
  isValidSuffixFor,
  learnerPrefix,
  suffixLength,
  suggestionCandidates,
  submanagerLoginId,
  type LoginIdKind,
} from '@/lib/domain/login-id';
import { createSupabaseAdminClient } from './admin';
import { allRows } from './chunks';
import { serverEnv } from './env';

/** One wording for a taken code, whether the pre-check or the auth service found it (D69). */
export const LOGIN_ID_TAKEN = 'This login ID is already taken — choose another';
export const MANAGER_SUFFIX_INVALID = 'Use exactly 2 letters or digits for a manager login ID';
export const LEARNER_SUFFIX_INVALID = 'Use exactly 4 letters or digits for a learner login ID';

export const newAccountSchema = z.object({
  loginId: z
    .string()
    .trim()
    .refine(isValidLoginId, 'Login ID must be 2–64 letters, digits, ".", "_" or "-"'),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  role: z.enum(['learner', 'submanager', 'manager', 'admin']).default('learner'),
  managerId: z.uuid().optional(),
  displayName: z.string().trim().max(120).optional(),
  preferredLanguage: z.enum(['th', 'en', 'zh', 'ta', 'ms']).default('th'),
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
  const { loginId, password, role, managerId, displayName, preferredLanguage } = parsed.data;
  if (role === 'submanager' && !managerId) {
    throw new ProvisioningError('A Submanager requires a parent Manager', 'no-manager');
  }
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
    app_metadata: { role, ...(role === 'submanager' ? { manager_id: managerId } : {}) },
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
  preferredLanguage?: 'th' | 'en' | 'zh' | 'ta' | 'ms';
};

/** The auth call behind a code; tests substitute it to make the auth service refuse. */
type Deps = { createAccount: typeof createAccount };

const newPersonSchema = newAccountSchema.omit({ loginId: true, role: true, managerId: true });

/** Everything the form can get wrong is checked before the auth service is asked. */
function parsePerson(input: NewPerson): z.infer<typeof newPersonSchema> {
  const parsed = newPersonSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProvisioningError(parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid');
  }
  return parsed.data;
}

/**
 * Staff type the manager's whole two-character code or the four-character learner suffix.
 */
function parseSuffix(kind: LoginIdKind, suffix: string): string {
  const trimmed = suffix.trim();
  if (!isValidSuffixFor(kind, trimmed)) {
    throw new ProvisioningError(
      kind === 'learner' ? LEARNER_SUFFIX_INVALID : MANAGER_SUFFIX_INVALID,
      'invalid-login-id',
    );
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
 * Every code held under a prefix with a suffix of this many characters, read a page at a time:
 * with an empty manager prefix that is two-character codes and none of their learners'. The prefix's own `_` and
 * `%` are matched literally, though no prefix the portal makes contains either.
 */
async function heldUnder(prefix: string, length: number): Promise<Set<string>> {
  const db = createSupabaseAdminClient();
  const literal = prefix.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = literal + '_'.repeat(length);
  const rows = await allRows((from, to) =>
    db
      .from('profiles')
      .select('login_id')
      .like('login_id', pattern)
      .order('login_id')
      .range(from, to),
  ).catch((error: { message?: string }) => {
    throw new ProvisioningError(error.message ?? 'Could not read the codes', 'unknown');
  });
  return new Set(rows.map((row) => row.login_id));
}

/**
 * A free suffix to prefill under a prefix: a manager's (one letter and one digit) or a
 * learner's under their team (two letters and two digits, D84). A couple of random batches, each
 * checked in one query, find one wherever there is room; a nearly full space can defeat them, so
 * then the codes held under the prefix are read and a free one picked, and "none free" means
 * none. Nothing is reserved; the create checks again.
 */
export async function suggestSuffix(
  kind: LoginIdKind,
  prefix: string,
  candidates: (count: number) => string[] = (count) => suggestionCandidates(kind, count),
  random: () => number = Math.random,
): Promise<string> {
  for (let batch = 0; batch < 2; batch++) {
    const offered = candidates(40);
    const taken = await takenAmong(offered.map((suffix) => prefix + suffix));
    const free = offered.find((suffix) => !taken.has(prefix + suffix));
    if (free) return free;
  }
  const held = await heldUnder(prefix, suffixLength(kind));
  const left = allSuffixes(kind).filter((suffix) => !held.has(prefix + suffix));
  if (left.length > 0) return left[Math.floor(random() * left.length)];
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
  person: z.infer<typeof newPersonSchema> & {
    role: 'manager' | 'learner' | 'submanager';
    managerId?: string;
  },
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

/** A manager is a team: the two-character code the owner typed prefixes every learner. */
export async function createManagerAccount(
  input: NewPerson & { suffix: string },
  deps: Deps = { createAccount },
): Promise<{ id: string; loginId: string }> {
  const person = parsePerson(input);
  const suffix = parseSuffix('manager', input.suffix);
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
  const suffix = parseSuffix('learner', input.suffix);
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

/** Deletes a learner only when the actor is the owner or the learner's own manager. */
export async function deleteLearnerAccount(actorId: string, learnerId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const [{ data: actor, error: actorError }, { data: learner, error: learnerError }] =
    await Promise.all([
      admin.from('profiles').select('id, role').eq('id', actorId).maybeSingle(),
      admin.from('profiles').select('id, role, manager_id').eq('id', learnerId).maybeSingle(),
    ]);
  if (actorError) throw actorError;
  if (learnerError) throw learnerError;
  const allowed =
    learner?.role === 'learner' &&
    (actor?.role === 'admin' || (actor?.role === 'manager' && learner.manager_id === actor.id));
  if (!allowed) throw new Error('Learner not found');

  const { error } = await admin.auth.admin.deleteUser(learner.id);
  if (error) throw error;
}

/** Legacy account mutations must never become another entry point for Submanager lifecycle. */
async function legacyAccount(userId: string, expectedRole?: 'manager'): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.role === 'submanager' ||
    (expectedRole && profile.role !== expectedRole)
  ) {
    throw new ProvisioningError('Account not found', 'invalid');
  }
}

async function changeAccountPassword(userId: string, newPassword: string): Promise<void> {
  if (!isValidPassword(newPassword)) {
    throw new ProvisioningError('Password must be 6–8 characters', 'invalid');
  }
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw new ProvisioningError(error.message, 'unknown');
}

export async function setAccountPassword(
  userId: string,
  newPassword: string,
  expectedRole?: 'manager',
): Promise<void> {
  await legacyAccount(userId, expectedRole);
  await changeAccountPassword(userId, newPassword);
}

/** Disabling bans the auth user (blocks sign-in and token refresh) and marks the profile. */
export async function setAccountStatus(
  userId: string,
  status: 'active' | 'disabled',
  expectedRole?: 'manager',
): Promise<void> {
  await legacyAccount(userId, expectedRole);
  const admin = createSupabaseAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === 'disabled' ? '876600h' : 'none',
  });
  if (authError) throw new ProvisioningError(authError.message, 'unknown');
  const { error } = await admin.from('profiles').update({ status }).eq('id', userId);
  if (error) throw new ProvisioningError(error.message, 'unknown');
}

/** Resolve an active exact-role Manager before any privileged account mutation. */
async function submanagerParent(managerId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('id, login_id, role, status, archived_at')
    .eq('id', managerId)
    .maybeSingle();
  if (error || !data || data.role !== 'manager' || data.status !== 'active' || data.archived_at) {
    throw new ProvisioningError('An active Manager is required', 'no-manager');
  }
  return data;
}

/** The Owner may manage any team's Submanager; a Manager only their own. */
async function ownedSubmanager(actorId: string, submanagerId: string) {
  const db = createSupabaseAdminClient();
  const { data: actor } = await db
    .from('profiles')
    .select('role, status')
    .eq('id', actorId)
    .maybeSingle();
  const owner = actor?.role === 'admin' && actor.status === 'active';
  if (!owner) await submanagerParent(actorId);
  const { data, error } = await db
    .from('profiles')
    .select('id, role, manager_id, archived_at')
    .eq('id', submanagerId)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.role !== 'submanager' ||
    (!owner && data.manager_id !== actorId) ||
    data.archived_at
  ) {
    throw new ProvisioningError('Submanager not found', 'invalid');
  }
  return data;
}

export async function createSubmanagerAccount(
  input: NewPerson & { managerId: string; suffix: string },
): Promise<{ id: string; loginId: string; managerId: string }> {
  const person = parsePerson(input);
  const manager = await submanagerParent(input.managerId);
  let loginId: string;
  try {
    loginId = submanagerLoginId(manager.login_id, input.suffix);
  } catch {
    throw new ProvisioningError(
      'Use exactly 2 letters or digits for a Submanager login ID',
      'invalid-login-id',
    );
  }
  const created = await createUnderCode(
    loginId,
    { ...person, role: 'submanager', managerId: manager.id },
    { createAccount },
  );
  return { id: created.id, loginId: created.loginId, managerId: manager.id };
}

export async function setSubmanagerStatus(
  actorId: string,
  submanagerId: string,
  status: 'active' | 'disabled',
): Promise<void> {
  await ownedSubmanager(actorId, submanagerId);
  if (status !== 'active' && status !== 'disabled')
    throw new ProvisioningError('Invalid status', 'invalid');
  // The database gate cannot reactivate an archived identity, including a concurrent archive.
  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ status })
    .eq('id', submanagerId)
    .is('archived_at', null)
    .select('id')
    .single();
  if (error) throw new ProvisioningError('Submanager not found', 'invalid');
  const { error: authError } = await createSupabaseAdminClient().auth.admin.updateUserById(
    submanagerId,
    {
      ban_duration: status === 'disabled' ? '876600h' : 'none',
    },
  );
  if (authError) throw new ProvisioningError(authError.message, 'unknown');
}

export async function resetSubmanagerPassword(
  actorId: string,
  submanagerId: string,
  password: string,
): Promise<void> {
  await ownedSubmanager(actorId, submanagerId);
  await changeAccountPassword(submanagerId, password);
}

/** Identity is retained because DBD creator references and the login code are permanent. */
export async function archiveSubmanager(actorId: string, submanagerId: string): Promise<void> {
  await ownedSubmanager(actorId, submanagerId);
  // Persist the access gate first; a failed auth ban must never leave a stale session usable.
  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ status: 'disabled', archived_at: new Date().toISOString() })
    .eq('id', submanagerId)
    .select('id')
    .single();
  if (error) throw new ProvisioningError(error.message, 'unknown');
  const { error: authError } = await createSupabaseAdminClient().auth.admin.updateUserById(
    submanagerId,
    { ban_duration: '876600h' },
  );
  if (authError) throw new ProvisioningError(authError.message, 'unknown');
}
