'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { fillMissingLanguages } from '@/lib/db/question-gen';
import {
  createQuestion,
  setApprovalStatus,
  updateQuestion,
  upsertQuestionLocalization,
} from '@/lib/db/questions';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { OptionKey, QuestionOption } from '@/lib/domain/assessment/engine';
import { TemplateSyntaxError } from '@/lib/domain/assessment/template';
import { QuestionGenError } from '@/lib/integrations/question-gen/types';

export type QuestionState = { ok: boolean; error: string | null };

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

const questionSchema = z.object({
  questionKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,79}$/, 'Key: lowercase letters, digits and dashes'),
  pools: z.array(z.enum(['quiz', 'exam'])).min(1, 'Choose at least one pool'),
  active: z.boolean(),
});

const localizationSchema = z.object({
  language: z.enum(['th', 'en', 'zh']),
  prompt: z.string().trim().min(1, 'Prompt is required').max(2000),
  options: z
    .array(z.object({ key: z.enum(['A', 'B', 'C', 'D']), text: z.string().trim().min(1) }))
    .min(2, 'At least two options'),
  correctKey: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().trim().max(2000).nullable(),
  ttsEnabled: z.boolean(),
});

function errorMessage(e: unknown): string {
  if (e instanceof TemplateSyntaxError) return e.message;
  if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23514') {
    return 'A question needs th, en and zh before it can be approved';
  }
  return e instanceof Error ? e.message : 'Unexpected error';
}

export async function saveQuestionAction(
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const parsed = questionSchema.safeParse({
    questionKey: formData.get('questionKey'),
    pools: formData.getAll('pools'),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  const db = await createSupabaseServerClient();
  let createdId: string | null = null;
  try {
    if (id) {
      await updateQuestion(db, id, parsed.data);
      revalidatePath(`/${locale}/admin/questions/${id}`);
      return { ok: true, error: null };
    }
    createdId = (await createQuestion(db, parsed.data, admin.id)).id;
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  redirect(`/${locale}/admin/questions/${createdId}`);
}

export async function saveQuestionLocalizationAction(
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const questionId = String(formData.get('questionId') ?? '');
  await requireAdmin(locale);
  const options: QuestionOption[] = OPTION_KEYS.map((key) => ({
    key,
    text: String(formData.get(`option_${key}`) ?? '').trim(),
  })).filter((o) => o.text.length > 0);
  const parsed = localizationSchema.safeParse({
    language: formData.get('language'),
    prompt: formData.get('prompt'),
    options,
    correctKey: formData.get('correctKey'),
    explanation: String(formData.get('explanation') ?? '').trim() || null,
    ttsEnabled: formData.get('ttsEnabled') === 'on',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  if (!parsed.data.options.some((o) => o.key === parsed.data.correctKey)) {
    return { ok: false, error: 'The correct key must be one of the filled options' };
  }
  try {
    await upsertQuestionLocalization(await createSupabaseServerClient(), questionId, parsed.data);
    revalidatePath(`/${locale}/admin/questions/${questionId}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setApprovalAction(
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const questionId = String(formData.get('questionId') ?? '');
  const status = formData.get('status');
  await requireAdmin(locale);
  if (status !== 'draft' && status !== 'approved' && status !== 'retired') {
    return { ok: false, error: 'Invalid status' };
  }
  try {
    await setApprovalStatus(await createSupabaseServerClient(), questionId, status);
    revalidatePath(`/${locale}/admin/questions/${questionId}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Inline approve from the list; keeps the current filters in the URL. */
export async function approveQuestionAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const questionId = String(formData.get('questionId') ?? '');
  await requireAdmin(locale);
  await setApprovalStatus(await createSupabaseServerClient(), questionId, 'approved');
  revalidatePath(`/${locale}/admin/questions`);
  const query = new URLSearchParams();
  const batch = String(formData.get('batch') ?? '');
  const status = String(formData.get('status') ?? '');
  if (batch) query.set('batch', batch);
  if (status) query.set('status', status);
  const suffix = query.toString();
  redirect(`/${locale}/admin/questions${suffix ? `?${suffix}` : ''}`);
}

export type FillState = { ok: boolean; error: string | null; written: string[] };

/** Translates the question's existing language(s) into the missing ones (P11). */
export async function fillMissingLanguagesAction(
  _prev: FillState,
  formData: FormData,
): Promise<FillState> {
  const locale = String(formData.get('locale') ?? 'th');
  const questionId = String(formData.get('questionId') ?? '');
  await requireAdmin(locale);
  try {
    const written = await fillMissingLanguages(await createSupabaseServerClient(), questionId);
    revalidatePath(`/${locale}/admin/questions/${questionId}`);
    return { ok: true, error: null, written };
  } catch (e) {
    if (e instanceof QuestionGenError) return { ok: false, error: e.code, written: [] };
    return { ok: false, error: errorMessage(e), written: [] };
  }
}
