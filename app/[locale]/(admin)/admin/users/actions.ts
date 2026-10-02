'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { assignDbdRecord, learnersOfRecords } from '@/lib/db/assignments';
import { recordAccountAction } from '@/lib/db/account-audit';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { createLearnerAccount } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';
import {
  contactFromForm,
  firstContactProblem,
  learnerContactSchema,
} from '@/lib/domain/learner-contact';
import { loginIdErrorMessage } from '../login-id-errors';

export type CreateUserState = {
  ok: boolean;
  error: string | null;
  createdLoginId: string | null;
  /** Thai name of the company the new learner was assigned to. */
  company: string | null;
};

/**
 * Creates a learner and assigns the chosen (confirmed) DBD record in one step: the learner's
 * study material, questions and bank date all derive from that record. Language is not chosen
 * here — every learner has all three and the switcher remembers the last one used.
 */
export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  const fail = (error: string): CreateUserState => ({
    ok: false,
    error,
    createdLoginId: null,
    company: null,
  });
  const db = await createSupabaseServerClient();

  // A manager creates inside their own team; the admin says which team it is (spec §7).
  const managerId = staff.role === 'manager' ? staff.id : String(formData.get('managerId') ?? '');
  if (!managerId) return fail('Choose the team this learner belongs to');

  // The learner is created with their name (D66) and the code the staff member typed after the
  // team's prefix (D69); the prefix itself is the server's, from the team.
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return fail("Enter the learner's name");

  // The contact details the manager gives the learner (D80), checked before any account exists.
  const contact = learnerContactSchema.safeParse(contactFromForm(formData));
  if (!contact.success) {
    const t = await getTranslations({ locale, namespace: 'admin.users.contact.errors' });
    return fail(t(firstContactProblem(contact.error)));
  }

  const dbdRecordId = String(formData.get('dbdRecordId') ?? '');
  if (!dbdRecordId) return fail('Choose the company the learner belongs to');
  const { data: record, error: recordError } = await db
    .from('dbd_records')
    .select('id, company_name_th, extraction_status')
    .eq('id', dbdRecordId)
    .maybeSingle();
  if (recordError) return fail(recordError.message);
  if (!record || record.extraction_status !== 'confirmed') {
    return fail('The chosen DBD record is not confirmed yet');
  }
  // One learner per company (D93), checked before any account exists so a refusal leaves none.
  const taken = await learnersOfRecords(createSupabaseAdminClient(), [record.id]);
  if (taken.has(record.id)) {
    const t = await getTranslations({ locale, namespace: 'admin.users' });
    return fail(t('companyTaken'));
  }

  let created: { id: string; loginId: string };
  try {
    created = await createLearnerAccount({
      suffix: String(formData.get('loginSuffix') ?? ''),
      password: String(formData.get('password') ?? ''),
      displayName,
      managerId,
      contact: contact.data,
    });
  } catch (e) {
    return fail(await loginIdErrorMessage(locale, e, 'learner'));
  }
  await recordAccountAction(staff.id, 'create', created.id, {
    role: 'learner',
    login_id: created.loginId,
    manager_id: managerId,
  });
  try {
    await assignDbdRecord(db, { userId: created.id, dbdRecordId: record.id });
  } catch (e) {
    revalidatePath(`/${locale}/admin/users`);
    const message = e instanceof Error ? e.message : String(e);
    return fail(`Created ${created.loginId}, but the company could not be assigned: ${message}`);
  }
  revalidatePath(`/${locale}/admin/users`);
  return {
    ok: true,
    error: null,
    createdLoginId: created.loginId,
    company: record.company_name_th ?? record.id,
  };
}
