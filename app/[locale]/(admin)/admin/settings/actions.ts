'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { isPolicyFieldKey } from '@/lib/config/policy-schema';
import { createSupabaseServerClient } from '@/lib/db/server';
import { updatePolicy } from '@/lib/db/settings';

export type SettingState = { key: string | null; ok: boolean; error: string | null };

export async function updatePolicyAction(
  _prev: SettingState,
  formData: FormData,
): Promise<SettingState> {
  const locale = String(formData.get('locale') ?? 'th');
  const key = String(formData.get('key') ?? '');
  const admin = await requireAdmin(locale);
  if (!isPolicyFieldKey(key)) return { key, ok: false, error: 'unknown_key' };
  const raw = String(formData.get('value') ?? '');
  const result = await updatePolicy(await createSupabaseServerClient(), key, raw, admin.id);
  if (!result.ok) return { key, ok: false, error: result.error };
  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}/dashboard`);
  return { key, ok: true, error: null };
}
