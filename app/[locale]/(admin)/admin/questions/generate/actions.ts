'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { generateQuestionsIntoBank } from '@/lib/db/question-gen';
import { createSupabaseServerClient } from '@/lib/db/server';
import { QuestionGenError } from '@/lib/integrations/question-gen/types';

export type GenerateState = {
  error: string | null;
  /** Rejections from the last run, shown before the redirect only when nothing was produced. */
  rejected: string[];
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const KNOWN_ERRORS = ['not_configured', 'provider', 'invalid_output', 'no_material'];

export async function generateQuestionsAction(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);

  const count = Number(formData.get('count') ?? 10);
  const templateCount = Number(formData.get('templateCount') ?? 0);
  const pools = formData
    .getAll('pools')
    .filter((p): p is 'quiz' | 'exam' => p === 'quiz' || p === 'exam');
  if (pools.length === 0) return { error: 'pools_required', rejected: [] };
  const difficultyRaw = String(formData.get('difficulty') ?? 'medium');
  const difficulty =
    difficultyRaw === 'easy' || difficultyRaw === 'hard' ? difficultyRaw : ('medium' as const);

  const file = formData.get('material_file');
  let upload: { name: string; bytes: Uint8Array; mimeType: string } | null = null;
  if (file && typeof file !== 'string' && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: 'file_too_large', rejected: [] };
    upload = {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
    };
  }

  let result;
  try {
    result = await generateQuestionsIntoBank(await createSupabaseServerClient(), admin.id, {
      referenceRecordId: String(formData.get('reference_record_id') ?? '') || null,
      studyMaterialIds: formData.getAll('study_material_ids').map(String),
      pastedText: String(formData.get('pasted_text') ?? ''),
      upload,
      count,
      templateCount,
      pools,
      difficulty,
      focus: String(formData.get('focus') ?? '').trim() || null,
    });
  } catch (e) {
    if (e instanceof QuestionGenError && KNOWN_ERRORS.includes(e.code)) {
      return { error: e.code, rejected: [] };
    }
    return { error: e instanceof Error ? e.message : 'unknown', rejected: [] };
  }
  if (result.produced === 0) {
    return { error: 'nothing_produced', rejected: result.rejected.map((r) => r.reason) };
  }
  revalidatePath(`/${locale}/admin/questions`);
  redirect(`/${locale}/admin/questions?batch=${result.batchId}`);
}
