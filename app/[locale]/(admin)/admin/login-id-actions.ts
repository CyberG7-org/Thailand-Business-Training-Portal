'use server';

import { requireAdmin, requireStaff } from '@/lib/auth/session';
import {
  ProvisioningError,
  isLoginIdTaken,
  learnerPrefixOf,
  suggestLearnerSuffix,
  suggestLoginSuffix,
} from '@/lib/db/provisioning';
import { MANAGER_PREFIX, isValidSuffixFor, type LoginIdKind } from '@/lib/domain/login-id';

/** Whose code is being chosen: a manager's (the owner only) or a learner's (staff). */
export type { LoginIdKind };
export type LoginIdQuery = { locale: string; kind: LoginIdKind; managerId?: string };
export type LoginIdCheck = 'available' | 'taken' | 'invalid' | 'no-team';

/**
 * The prefix the caller may create under, or null when there is no team to use. A manager's
 * own team is implied whatever the form sends, so another team's prefix cannot be asked about.
 */
async function prefixFor({ locale, kind, managerId }: LoginIdQuery): Promise<string | null> {
  if (kind === 'manager') {
    await requireAdmin(locale);
    return MANAGER_PREFIX;
  }
  const staff = await requireStaff(locale);
  const team = staff.role === 'manager' ? staff.id : managerId;
  if (!team) return null;
  try {
    return await learnerPrefixOf(team);
  } catch (e) {
    if (e instanceof ProvisioningError && e.code === 'no-manager') return null;
    throw e;
  }
}

/**
 * A free suffix to prefill (D69) — a learner's is two letters and two digits (D84). Nothing is
 * reserved; the create action checks again.
 */
export async function suggestLoginIdAction(
  query: LoginIdQuery,
): Promise<{ suffix: string | null }> {
  const prefix = await prefixFor(query);
  if (!prefix) return { suffix: null };
  return {
    suffix:
      query.kind === 'learner'
        ? await suggestLearnerSuffix(prefix)
        : await suggestLoginSuffix(prefix),
  };
}

/** Whether the code the staff member is typing is free, for the field to say as they type. */
export async function checkLoginIdAction(
  query: LoginIdQuery & { suffix: string },
): Promise<{ state: LoginIdCheck }> {
  const suffix = query.suffix.trim();
  if (!isValidSuffixFor(query.kind, suffix)) return { state: 'invalid' };
  const prefix = await prefixFor(query);
  if (!prefix) return { state: 'no-team' };
  return { state: (await isLoginIdTaken(prefix + suffix)) ? 'taken' : 'available' };
}
