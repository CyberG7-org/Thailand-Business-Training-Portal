'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { loadStarterVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';

export type StarterState = { done: boolean; created: number; failed: boolean };

/** Adds the starter drafts that are not in the bank yet, under the Owner's own session. */
export async function loadStarterAction(
  _prev: StarterState,
  formData: FormData,
): Promise<StarterState> {
  const locale = String(formData.get('locale') ?? 'th');
  const owner = await requireAdmin(locale);
  try {
    const { created } = await loadStarterVariants(
      await createSupabaseServerClient(),
      MCQ_STARTER,
      owner.id,
    );
    revalidatePath(`/${locale}/admin/questions`);
    return { done: true, created: created.length, failed: false };
  } catch (e) {
    console.error('starter drafts', e);
    return { done: false, created: 0, failed: true };
  }
}
