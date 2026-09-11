'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { markCompleted, markViewed } from '@/lib/db/study';

export async function markViewedAction(materialId: string): Promise<void> {
  const user = await requireUser('th');
  await markViewed(await createSupabaseServerClient(), user.id, materialId);
}

export async function markCompletedAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const materialId = String(formData.get('materialId') ?? '');
  const contentKey = String(formData.get('contentKey') ?? '');
  const user = await requireUser(locale);
  await markCompleted(await createSupabaseServerClient(), user.id, materialId);
  revalidatePath(`/${locale}/study/${contentKey}`);
  revalidatePath(`/${locale}/study`);
}
