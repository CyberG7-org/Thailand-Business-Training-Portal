'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import {
  businessCategoryInputSchema,
  createBusinessCategory,
  updateBusinessCategory,
} from '@/lib/db/business-categories';
import { createSupabaseServerClient } from '@/lib/db/server';

export type CategoryFormState = { ok: boolean; error: 'duplicate' | 'invalid' | 'failed' | null };

function fields(formData: FormData) {
  return {
    key: String(formData.get('key') ?? ''),
    label_th: String(formData.get('label_th') ?? ''),
    label_en: String(formData.get('label_en') ?? ''),
    label_zh: String(formData.get('label_zh') ?? ''),
    sort_order: String(formData.get('sort_order') ?? '0'),
    active: formData.get('active') === 'on',
  };
}

/** Owner only (D73); written through the Owner's session so the audit names them (D30). */
export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const parsed = businessCategoryInputSchema.safeParse({ ...fields(formData), active: true });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  try {
    await createBusinessCategory(await createSupabaseServerClient(), parsed.data);
    revalidatePath(`/${locale}/admin/business-categories`);
    return { ok: true, error: null };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, error: code === '23505' ? 'duplicate' : 'failed' };
  }
}

export async function updateCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const parsed = businessCategoryInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { key, ...rest } = parsed.data;
  try {
    await updateBusinessCategory(await createSupabaseServerClient(), key, rest);
    revalidatePath(`/${locale}/admin/business-categories`);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
