'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { requeueNotification } from '@/lib/db/notifications';
import { createSupabaseServerClient } from '@/lib/db/server';

export async function requeueAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  await requeueNotification(await createSupabaseServerClient(), id);
  revalidatePath(`/${locale}/admin/notifications`);
}
