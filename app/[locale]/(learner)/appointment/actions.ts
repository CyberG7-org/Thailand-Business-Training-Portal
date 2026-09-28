'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { AppointmentError, bookAppointment, cancelAppointment } from '@/lib/db/appointments';

export type ActionState = { error: string | null };

function code(e: unknown): string {
  return e instanceof AppointmentError ? e.code : 'unknown';
}

/** Books the slot the learner clicked; the server re-checks everything (spec §5.2). */
export async function bookAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get('locale') ?? 'th') as AppLocale;
  const startsAt = String(formData.get('startsAt') ?? '');
  const user = await requireUser(locale);
  try {
    await bookAppointment(user.id, startsAt);
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/appointment`);
  redirect(`/${locale}/appointment`);
}

/** The learner cancels their own booking, until the notice window closes. */
export async function cancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get('locale') ?? 'th') as AppLocale;
  const appointmentId = String(formData.get('appointmentId') ?? '');
  const user = await requireUser(locale);
  try {
    await cancelAppointment({ id: user.id, role: 'learner' }, appointmentId);
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/appointment`);
  redirect(`/${locale}/appointment`);
}
