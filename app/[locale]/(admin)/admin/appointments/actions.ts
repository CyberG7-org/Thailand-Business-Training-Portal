'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/session';
import {
  AppointmentError,
  bookAppointmentForManager,
  cancelAppointment,
} from '@/lib/db/appointments';
import { isISODate } from '@/lib/domain/thai-date';

export type StaffActionState = { error: string | null; ok?: boolean };

function code(e: unknown): string {
  return e instanceof AppointmentError ? e.code : 'unknown';
}

/** D102: only the owning manager can set or replace a ready learner's date. */
export async function bookForLearnerAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  const date = String(formData.get('date') ?? '');
  const learnerId = String(formData.get('learnerId') ?? '');
  if (staff.role !== 'manager') return { error: 'forbidden' };
  if (!learnerId || !isISODate(date)) {
    return { error: 'slot_unavailable' };
  }
  try {
    await bookAppointmentForManager(staff.id, learnerId, date);
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/admin/appointments`);
  revalidatePath(`/${locale}/admin/learners`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/appointment`);
  return { error: null, ok: true };
}

export async function cancelBookingAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  try {
    await cancelAppointment(
      { id: staff.id, role: staff.role as 'admin' | 'manager' },
      String(formData.get('appointmentId') ?? ''),
    );
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/admin/appointments`);
  revalidatePath(`/${locale}/admin/learners`);
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/appointment`);
  return { error: null, ok: true };
}
