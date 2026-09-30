import 'server-only';
import { getTranslations } from 'next-intl/server';
import { ProvisioningError } from '@/lib/db/provisioning';

/**
 * A refused create, in the staff member's language when the reason is the code (D69) — the one
 * refusal they can fix by typing — and in the error's own words otherwise, as before.
 */
export async function loginIdErrorMessage(locale: string, e: unknown): Promise<string> {
  if (!(e instanceof ProvisioningError)) return 'Unexpected error';
  if (e.code === 'duplicate' || e.code === 'invalid-login-id') {
    const t = await getTranslations({ locale, namespace: 'admin.loginIdField' });
    return t(e.code === 'duplicate' ? 'taken' : 'invalid');
  }
  return e.message;
}
