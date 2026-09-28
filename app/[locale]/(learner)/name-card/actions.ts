'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { NameCardError, generateNameCard, queueNameCardToTelegram } from '@/lib/db/name-cards';
import { ReactPdfRenderer } from '@/lib/integrations/pdf/name-card';

export type NameCardState = {
  ok: boolean;
  error: string | null;
  fields: string[];
  queued?: number;
  /** What the learner typed, handed back after a failure so the form keeps it. */
  values?: { phone: string; holderNameTh: string; holderNameEn: string };
};

function fail(e: unknown): NameCardState {
  if (e instanceof NameCardError) return { ok: false, error: e.code, fields: e.fields };
  return { ok: false, error: e instanceof Error ? e.message : 'unknown', fields: [] };
}

export async function generateNameCardAction(
  _prev: NameCardState,
  formData: FormData,
): Promise<NameCardState> {
  const locale = String(formData.get('locale') ?? 'th');
  const user = await requireUser(locale);
  const values = {
    phone: String(formData.get('phone') ?? ''),
    holderNameTh: String(formData.get('holderNameTh') ?? ''),
    holderNameEn: String(formData.get('holderNameEn') ?? ''),
  };
  try {
    await generateNameCard(
      user.id,
      { ...values, holderNameEn: values.holderNameEn.trim() || null },
      new ReactPdfRenderer(),
    );
    revalidatePath(`/${locale}/name-card`);
    revalidatePath(`/${locale}/dashboard`);
    return { ok: true, error: null, fields: [] };
  } catch (e) {
    return { ...fail(e), values };
  }
}

export async function sendNameCardAction(
  _prev: NameCardState,
  formData: FormData,
): Promise<NameCardState> {
  const locale = String(formData.get('locale') ?? 'th');
  const cardId = String(formData.get('cardId') ?? '');
  const user = await requireUser(locale);
  try {
    const queued = await queueNameCardToTelegram(user.id, cardId);
    revalidatePath(`/${locale}/name-card`);
    return { ok: true, error: null, fields: [], queued };
  } catch (e) {
    return fail(e);
  }
}
