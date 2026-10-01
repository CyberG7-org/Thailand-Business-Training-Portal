import 'server-only';
import { getTranslations } from 'next-intl/server';
import { ProvisioningError } from '@/lib/db/provisioning';
import type { LoginIdKind } from '@/lib/domain/login-id';

/**
 * A refused create, in the staff member's language when the reason is the code (D69) — the one
 * refusal they can fix by typing — and in the error's own words otherwise, as before.
 */
export async function loginIdErrorMessage(
  locale: string,
  e: unknown,
  kind: LoginIdKind,
): Promise<string> {
  if (!(e instanceof ProvisioningError)) return 'Unexpected error';
  if (e.code === 'duplicate' || e.code === 'invalid-login-id') {
    const t = await getTranslations({ locale, namespace: 'admin.loginIdField' });
    if (e.code === 'duplicate') return t('taken');
    // Each kind of code has its own shape (D84, D85), so the refusal says which.
    return t(kind === 'learner' ? 'invalidLearner' : 'invalid');
  }
  return e.message;
}
