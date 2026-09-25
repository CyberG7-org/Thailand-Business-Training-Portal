'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/session';
import { assignDbdRecord } from '@/lib/db/assignments';
import { ProvisioningError, createLearnerAccount } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';

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

  let created: { id: string; loginId: string };
  try {
    created = await createLearnerAccount({
      password: String(formData.get('password') ?? ''),
      displayName: String(formData.get('displayName') ?? '') || undefined,
      managerId,
    });
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
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
