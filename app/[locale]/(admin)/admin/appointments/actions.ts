'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/session';
import { AppointmentError, addBlock, cancelAppointment, removeBlock } from '@/lib/db/appointments';
import { isISODate } from '@/lib/domain/thai-date';

export type StaffActionState = { error: string | null; ok?: boolean };

function code(e: unknown): string {
  return e instanceof AppointmentError ? e.code : 'unknown';
}

/** The calendar a staff action targets: a manager's own; the admin's choice, "admin" being null. */
function teamFrom(staff: { id: string; role: 'admin' | 'manager' }, raw: string): string | null {
  if (staff.role === 'manager') return staff.id;
  return raw === '' || raw === 'admin' ? null : raw;
}

export async function blockAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  const date = String(formData.get('date') ?? '');
  const fromHour = Number(formData.get('fromHour'));
  const toHour = Number(formData.get('toHour'));
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!isISODate(date) || !Number.isInteger(fromHour) || !Number.isInteger(toHour)) {
    return { error: 'slot_unavailable' };
  }
  try {
    await addBlock(
      { id: staff.id, role: staff.role as 'admin' | 'manager' },
      {
        teamId: teamFrom(
          { id: staff.id, role: staff.role as 'admin' | 'manager' },
          String(formData.get('team') ?? ''),
        ),
        date,
        fromHour,
        toHour,
        reason,
      },
    );
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/admin/appointments`);
  return { error: null, ok: true };
}

export async function unblockAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  try {
    await removeBlock(
      { id: staff.id, role: staff.role as 'admin' | 'manager' },
      String(formData.get('blockId') ?? ''),
    );
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/admin/appointments`);
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
  return { error: null, ok: true };
}
