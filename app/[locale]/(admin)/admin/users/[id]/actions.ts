'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { assignDbdRecord, deactivateAssignment, updateAssignmentRole } from '@/lib/db/assignments';
import { learnerRoleSchema } from '@/lib/domain/bank-interview';
import { ProvisioningError, setAccountPassword, setAccountStatus } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';

export type AccountActionState = { message: string | null; error: string | null };

function errorMessage(e: unknown): string {
  return e instanceof ProvisioningError || e instanceof Error ? e.message : 'Unexpected error';
}

export async function resetPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  await requireAdmin(locale);
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
  const admin = await requireAdmin(locale);
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
  await requireAdmin(locale);
  if (!dbdRecordId) return { message: null, error: 'no-record' };
  try {
    await assignDbdRecord(await createSupabaseServerClient(), { userId, dbdRecordId });
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
  await requireAdmin(locale);
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
  await requireAdmin(locale);
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
