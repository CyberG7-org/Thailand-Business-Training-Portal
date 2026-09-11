'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import {
  createStudyMaterial,
  updateStudyMaterial,
  uploadStudyPdf,
  upsertLocalization,
} from '@/lib/db/study';

export type ContentState = { ok: boolean; error: string | null };

const materialSchema = z.object({
  contentKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,79}$/, 'Key: lowercase letters, digits and dashes'),
  type: z.enum(['card', 'pdf']),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
  active: z.boolean(),
});

const localizationSchema = z.object({
  language: z.enum(['th', 'en', 'zh']),
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().trim().max(50000).nullable(),
  ttsEnabled: z.boolean(),
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Unexpected error';
}

export async function saveMaterialAction(
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const parsed = materialSchema.safeParse({
    contentKey: formData.get('contentKey'),
    type: formData.get('type'),
    sortOrder: formData.get('sortOrder'),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };

  const db = await createSupabaseServerClient();
  let createdId: string | null = null;
  try {
    if (id) {
      await updateStudyMaterial(db, id, parsed.data);
      revalidatePath(`/${locale}/admin/content/${id}`);
      return { ok: true, error: null };
    }
    createdId = (await createStudyMaterial(db, parsed.data, admin.id)).id;
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  redirect(`/${locale}/admin/content/${createdId}`);
}

export async function saveLocalizationAction(
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const locale = String(formData.get('locale') ?? 'th');
  const materialId = String(formData.get('materialId') ?? '');
  await requireAdmin(locale);
  const parsed = localizationSchema.safeParse({
    language: formData.get('language'),
    title: formData.get('title'),
    body: String(formData.get('body') ?? '') || null,
    ttsEnabled: formData.get('ttsEnabled') === 'on',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  try {
    await upsertLocalization(await createSupabaseServerClient(), materialId, parsed.data);
    revalidatePath(`/${locale}/admin/content/${materialId}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function uploadStudyPdfAction(
  _prev: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const locale = String(formData.get('locale') ?? 'th');
  const materialId = String(formData.get('materialId') ?? '');
  const language = formData.get('language');
  await requireAdmin(locale);
  if (language !== 'th' && language !== 'en' && language !== 'zh') {
    return { ok: false, error: 'invalid-language' };
  }
  const file = formData.get('document');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'no-file' };
  if (file.type !== 'application/pdf' || file.size > MAX_PDF_BYTES) {
    return { ok: false, error: 'invalid-file' };
  }
  try {
    await uploadStudyPdf(await createSupabaseServerClient(), materialId, language, file);
    revalidatePath(`/${locale}/admin/content/${materialId}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
