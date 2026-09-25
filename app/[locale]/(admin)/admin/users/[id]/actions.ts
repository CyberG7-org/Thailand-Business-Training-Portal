'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, type CurrentUser } from '@/lib/auth/session';
import { assignDbdRecord, deactivateAssignment, updateAssignmentRole } from '@/lib/db/assignments';
import { learnerRoleSchema } from '@/lib/domain/bank-interview';
import { ProvisioningError, setAccountPassword, setAccountStatus } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';

export type AccountActionState = { message: string | null; error: string | null };

/**
 * Staff may act on an account only when it is theirs: the admin on anyone, a manager on their own
 * learners. setAccountStatus and setAccountPassword run as service role, so RLS cannot do this.
 */
async function requireManageable(locale: string, userId: string): Promise<CurrentUser> {
  const staff = await requireStaff(locale);
  if (staff.role === 'admin') return staff;
  const db = await createSupabaseServerClient();
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('manager_id', staff.id)
    .maybeSingle();
  if (!data) redirect(`/${locale}/admin/users`);
  return staff;
}

function errorMessage(e: unknown): string {
  return e instanceof ProvisioningError || e instanceof Error ? e.message : 'Unexpected error';
}

export async function resetPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  await requireManageable(locale, userId);
  try {
    await setAccountPassword(userId, String(formData.get('password') ?? ''));
    return { message: 'password-updated', error: null };
  } catch (e) {
    return { message: null, error: errorMessage(e) };
  }
}

export async function setStatusAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const status = formData.get('status') === 'disabled' ? 'disabled' : 'active';
  const admin = await requireManageable(locale, userId);
  if (admin.id === userId && status === 'disabled') {
    return { message: null, error: 'You cannot disable your own account' };
  }
  try {
    await setAccountStatus(userId, status);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'status-updated', error: null };
  } catch (e) {
    return { message: null, error: errorMessage(e) };
  }
}

export async function assignRecordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const dbdRecordId = String(formData.get('dbdRecordId') ?? '');
  await requireManageable(locale, userId);
  if (!dbdRecordId) return { message: null, error: 'no-record' };
  // The picker offers only the learner's own team's companies and the admin's untied ones; this
  // is the check behind it, since the admin's client can read every team's records.
  const db = await createSupabaseServerClient();
  const [{ data: record }, { data: learner }] = await Promise.all([
    db.from('dbd_records').select('team_id').eq('id', dbdRecordId).maybeSingle(),
    db.from('profiles').select('manager_id').eq('id', userId).maybeSingle(),
  ]);
  if (!record) return { message: null, error: 'no-record' };
  if (record.team_id && record.team_id !== learner?.manager_id) {
    return { message: null, error: 'other-team' };
  }
  try {
    await assignDbdRecord(db, { userId, dbdRecordId });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'assigned', error: null };
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '23505') return { message: null, error: 'already-assigned' };
    if (code === '23514') return { message: null, error: 'not-confirmed' };
    return { message: null, error: errorMessage(e) };
  }
}

export async function deactivateAssignmentAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  await requireManageable(locale, userId);
  try {
    await deactivateAssignment(await createSupabaseServerClient(), assignmentId);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'deactivated', error: null };
  } catch (e) {
    return { message: null, error: errorMessage(e) };
  }
}

export async function updateAssignmentRoleAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  await requireManageable(locale, userId);
  const parsed = learnerRoleSchema.safeParse({
    holder_name: formData.get('holder_name'),
    position: formData.get('position'),
    responsibilities: formData.get('responsibilities'),
    relationship_to_shareholders: formData.get('relationship_to_shareholders'),
  });
  if (!parsed.success) {
    return { message: null, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  try {
    await updateAssignmentRole(await createSupabaseServerClient(), assignmentId, parsed.data);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'role-saved', error: null };
  } catch (e) {
    return { message: null, error: errorMessage(e) };
  }
}
