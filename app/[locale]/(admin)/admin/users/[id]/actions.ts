'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaff, type CurrentUser } from '@/lib/auth/session';
import { recordAccountAction } from '@/lib/db/account-audit';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import {
  assignDbdRecord,
  deactivateAssignment,
  learnersOfRecords,
  updateAssignmentRole,
} from '@/lib/db/assignments';
import { learnerRoleSchema } from '@/lib/domain/bank-interview';
import { dbdPeople, isDbdPerson } from '@/lib/domain/standard-role';
import {
  PinError,
  confirmAssignmentRole,
  evaluationInProgress,
  moveAssignmentToVersion,
} from '@/lib/db/pinning';
import {
  contactFromForm,
  firstContactProblem,
  learnerContactSchema,
} from '@/lib/domain/learner-contact';
import {
  ProvisioningError,
  contactColumns,
  setAccountPassword,
  setAccountStatus,
} from '@/lib/db/provisioning';
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
  if (!data) redirect(`/${locale}/admin/learners`);
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
  // One learner per company (D93).
  const taken = await learnersOfRecords(createSupabaseAdminClient(), [dbdRecordId]);
  if (taken.has(dbdRecordId)) return { message: null, error: 'company-taken' };
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

/**
 * The contact details a manager gives their learner (D80). Written under the caller's own
 * client, so RLS keeps a manager to their own team; audited like the other account changes.
 */
export async function updateContactAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const staff = await requireManageable(locale, userId);
  const parsed = learnerContactSchema.safeParse(contactFromForm(formData));
  if (!parsed.success) {
    const t = await getTranslations({ locale, namespace: 'admin.users.contact.errors' });
    return { message: null, error: t(firstContactProblem(parsed.error)) };
  }
  const { error } = await (
    await createSupabaseServerClient()
  )
    .from('profiles')
    .update(contactColumns(parsed.data))
    .eq('id', userId)
    .select('id')
    .single();
  if (error) return { message: null, error: errorMessage(error) };
  await recordAccountAction(staff.id, 'contact', userId, contactColumns(parsed.data));
  revalidatePath(`/${locale}/admin/users/${userId}`);
  return { message: 'contact-saved', error: null };
}

export async function updateAssignmentRoleAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  await requireManageable(locale, userId);
  // Only the name is chosen; position, responsibilities and relationship are the same for
  // every learner (D94). What was typed for them earlier stays stored.
  const parsed = learnerRoleSchema.shape.holder_name.safeParse(formData.get('holder_name'));
  if (!parsed.success) {
    return { message: null, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  // A confirmed role is what an evaluation reads (plan decision 4): no edits mid-evaluation.
  const db = await createSupabaseServerClient();
  const { data: current } = await db
    .from('user_dbd_assignments')
    .select(
      'role_confirmed_at, position, responsibilities, relationship_to_shareholders, dbd_records(directors, structured_data)',
    )
    .eq('id', assignmentId)
    .maybeSingle();
  if (!current) return { message: null, error: 'not-found' };
  // The name has to be one printed in the DBD documents (D94).
  const record = Array.isArray(current.dbd_records) ? current.dbd_records[0] : current.dbd_records;
  const { people } = dbdPeople(record ?? null);
  if (parsed.data && !isDbdPerson(parsed.data, people)) {
    return { message: null, error: 'name-not-in-dbd' };
  }
  if (current.role_confirmed_at && (await evaluationInProgress(db, userId))) {
    return { message: null, error: 'evaluation-in-progress' };
  }
  try {
    await updateAssignmentRole(db, assignmentId, {
      holder_name: parsed.data,
      position: current.position,
      responsibilities: current.responsibilities,
      relationship_to_shareholders: current.relationship_to_shareholders,
    });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'role-saved', error: null };
  } catch (e) {
    return { message: null, error: errorMessage(e) };
  }
}

export type VersionActionState = {
  message: 'moved' | 'role-confirmed' | null;
  n: number | null;
  error: string | null;
};

function pinErrorKey(e: unknown): string {
  return e instanceof PinError ? e.code.replace(/_/g, '-') : errorMessage(e);
}

/** "Move to version n" (D75): under the caller's own client, so the audit names them. */
export async function moveAssignmentAction(
  _prev: VersionActionState,
  formData: FormData,
): Promise<VersionActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  await requireManageable(locale, userId);
  try {
    const moved = await moveAssignmentToVersion(await createSupabaseServerClient(), {
      assignmentId,
      versionId,
    });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'moved', n: moved.to, error: null };
  } catch (e) {
    return { message: null, n: null, error: pinErrorKey(e) };
  }
}

export async function confirmRoleAction(
  _prev: VersionActionState,
  formData: FormData,
): Promise<VersionActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const staff = await requireManageable(locale, userId);
  try {
    await confirmAssignmentRole(await createSupabaseServerClient(), {
      assignmentId,
      actorId: staff.id,
    });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'role-confirmed', n: null, error: null };
  } catch (e) {
    return { message: null, n: null, error: pinErrorKey(e) };
  }
}
