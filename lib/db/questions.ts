import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLocale } from '@/i18n/routing';
import type { OptionKey, QuestionOption } from '@/lib/domain/assessment/engine';
import { placeholderFields, type TemplateField } from '@/lib/domain/assessment/template';
import type { Database, Json } from './database.types';

type Db = SupabaseClient<Database>;
export type QuestionRow = Database['public']['Tables']['questions']['Row'];
export type QuestionLocalizationRow = Database['public']['Tables']['question_localizations']['Row'];
export type QuestionWithLocalizations = QuestionRow & {
  question_localizations: QuestionLocalizationRow[];
};

export async function listQuestions(db: Db): Promise<QuestionWithLocalizations[]> {
  const { data, error } = await db
    .from('questions')
    .select('*, question_localizations(*)')
    .order('question_key');
  if (error) throw error;
  return data as QuestionWithLocalizations[];
}

export async function getQuestion(db: Db, id: string): Promise<QuestionWithLocalizations | null> {
  const { data, error } = await db
    .from('questions')
    .select('*, question_localizations(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as QuestionWithLocalizations | null) ?? null;
}

export type QuestionInput = {
  questionKey: string;
  pools: Array<'quiz' | 'exam'>;
  active: boolean;
};

export async function createQuestion(
  db: Db,
  input: QuestionInput,
  createdBy: string,
): Promise<QuestionRow> {
  const { data, error } = await db
    .from('questions')
    .insert({
      question_key: input.questionKey,
      kind: 'generic',
      pools: input.pools,
      active: input.active,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(
  db: Db,
  id: string,
  input: Omit<QuestionInput, 'questionKey'>,
): Promise<void> {
  const { error } = await db
    .from('questions')
    .update({ pools: input.pools, active: input.active })
    .eq('id', id);
  if (error) throw error;
}

export async function setApprovalStatus(
  db: Db,
  id: string,
  status: 'draft' | 'approved' | 'retired',
): Promise<void> {
  const { error } = await db.from('questions').update({ approval_status: status }).eq('id', id);
  if (error) throw error;
}

export type QuestionLocalizationInput = {
  language: AppLocale;
  prompt: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: string | null;
  ttsEnabled: boolean;
};

/**
 * Saves one language and recomputes the question's kind and field dependencies from the
 * placeholders used across all of its languages (D17/D19).
 */
export async function upsertQuestionLocalization(
  db: Db,
  questionId: string,
  input: QuestionLocalizationInput,
): Promise<void> {
  // Validates placeholder syntax before anything is written.
  const fields = new Set<TemplateField>();
  for (const text of [input.prompt, ...input.options.map((o) => o.text)]) {
    for (const f of placeholderFields(text)) fields.add(f);
  }
  const { error } = await db.from('question_localizations').upsert(
    {
      question_id: questionId,
      language: input.language,
      prompt: input.prompt,
      options: input.options as unknown as Json,
      correct_key: input.correctKey,
      explanation: input.explanation,
      tts_enabled: input.language === 'th' ? input.ttsEnabled : false,
    },
    { onConflict: 'question_id,language' },
  );
  if (error) throw error;

  const question = await getQuestion(db, questionId);
  if (!question) return;
  for (const loc of question.question_localizations) {
    for (const text of [
      loc.prompt,
      ...(loc.options as unknown as QuestionOption[]).map((o) => o.text),
    ]) {
      for (const f of placeholderFields(text)) fields.add(f);
    }
  }
  const deps = [...fields];
  const { error: depsError } = await db
    .from('questions')
    .update({ dbd_field_dependencies: deps, kind: deps.length > 0 ? 'dbd_template' : 'generic' })
    .eq('id', questionId);
  if (depsError) throw depsError;
}
