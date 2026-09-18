import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOCALES, type AppLocale } from '@/i18n/routing';
import type { OptionKey, QuestionOption } from '@/lib/domain/assessment/engine';
import { getQuestionGenerator } from '@/lib/integrations/question-gen';
import {
  QuestionGenError,
  type GeneratedLocalization,
  type MaterialBundle,
  type QuestionGenerator,
} from '@/lib/integrations/question-gen/types';
import {
  translationProblem,
  validateGenerated,
  type Rejection,
} from '@/lib/integrations/question-gen/validate';
import type { Database } from './database.types';
import { getQuestion, upsertQuestionLocalization } from './questions';

type Db = SupabaseClient<Database>;
export type GenerationBatchRow = Database['public']['Tables']['question_generation_batches']['Row'];

export type GenerateBankInput = {
  studyMaterialIds: string[];
  pastedText: string;
  upload: { name: string; bytes: Uint8Array; mimeType: string } | null;
  count: number;
  templateCount: number;
  pools: Array<'quiz' | 'exam'>;
  difficulty: 'easy' | 'medium' | 'hard';
  focus: string | null;
};

export type GenerateBankResult = {
  batchId: string;
  produced: number;
  rejected: Rejection[];
  questionIds: string[];
};

const MAX_COUNT = 40;

/** Turns an uploaded file into model material: PDFs stay binary, DOCX/TXT/MD become text. */
export async function uploadToMaterial(
  upload: NonNullable<GenerateBankInput['upload']>,
): Promise<{ text: string; pdf: Uint8Array | null }> {
  const name = upload.name.toLowerCase();
  if (upload.mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    return { text: '', pdf: upload.bytes };
  }
  if (name.endsWith('.docx') || upload.mimeType.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(upload.bytes) });
    return { text: result.value ?? '', pdf: null };
  }
  return { text: Buffer.from(upload.bytes).toString('utf8'), pdf: null };
}

/** Study cards as material: Thai body first, any other language as fallback. */
export async function studyCardsToText(db: Db, materialIds: string[]): Promise<string> {
  if (materialIds.length === 0) return '';
  const { data, error } = await db
    .from('study_materials')
    .select('content_key, study_material_localizations(language, title, body)')
    .in('id', materialIds);
  if (error) throw error;
  const parts: string[] = [];
  for (const m of data ?? []) {
    const locs = m.study_material_localizations as {
      language: string;
      title: string;
      body: string | null;
    }[];
    const chosen = locs.find((l) => l.language === 'th' && l.body) ?? locs.find((l) => l.body);
    if (chosen?.body) parts.push(`# ${chosen.title}\n${chosen.body}`);
  }
  return parts.join('\n\n');
}

export async function buildMaterial(db: Db, input: GenerateBankInput): Promise<MaterialBundle> {
  const [cards, uploaded] = await Promise.all([
    studyCardsToText(db, input.studyMaterialIds),
    input.upload ? uploadToMaterial(input.upload) : Promise.resolve({ text: '', pdf: null }),
  ]);
  const text = [cards, input.pastedText, uploaded.text]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
  return { text, pdf: uploaded.pdf };
}

function toLocalizationInput(language: AppLocale, loc: GeneratedLocalization) {
  return {
    language,
    prompt: loc.prompt,
    options: loc.options.map((o) => ({
      key: o.key as OptionKey,
      text: o.text,
    })) as QuestionOption[],
    correctKey: loc.correct_key as OptionKey,
    explanation: loc.explanation || null,
    ttsEnabled: false,
  };
}

/**
 * Runs one generation and stores the accepted questions as drafts grouped in a batch. Uses the
 * admin's own client so RLS and the audit trigger see the real actor.
 */
export async function generateQuestionsIntoBank(
  db: Db,
  adminId: string,
  input: GenerateBankInput,
  generator: QuestionGenerator | null = getQuestionGenerator(),
): Promise<GenerateBankResult> {
  if (!generator)
    throw new QuestionGenError('Question generation is not configured', 'not_configured');
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(input.count)));
  const templateCount = Math.max(0, Math.min(count, Math.floor(input.templateCount)));
  const material = await buildMaterial(db, input);
  if (!material.text && !material.pdf && templateCount < count) {
    throw new QuestionGenError('Provide study cards, text or a document', 'no_material');
  }

  const generated = await generator.generate({
    material,
    count,
    templateCount,
    difficulty: input.difficulty,
    focus: input.focus,
  });
  const { accepted, rejected } = validateGenerated(generated);

  const summary = [
    input.studyMaterialIds.length ? `${input.studyMaterialIds.length} study card(s)` : null,
    input.pastedText.trim() ? `${input.pastedText.trim().length} chars pasted` : null,
    input.upload ? `file ${input.upload.name}` : null,
    input.focus ? `focus: ${input.focus}` : null,
  ]
    .filter(Boolean)
    .join('; ');
  const { data: batch, error: batchError } = await db
    .from('question_generation_batches')
    .insert({
      created_by: adminId,
      provider: generator.name,
      model: generator.model,
      material_summary: summary || 'template questions only',
      requested: count,
      produced: accepted.length,
      rejected: rejected.length,
    })
    .select()
    .single();
  if (batchError) throw batchError;

  const questionIds: string[] = [];
  const prefix = `ai-${batch.id.slice(0, 8)}`;
  for (let i = 0; i < accepted.length; i++) {
    const q = accepted[i];
    const { data: row, error } = await db
      .from('questions')
      .insert({
        question_key: `${prefix}-${String(i + 1).padStart(2, '0')}`,
        kind: q.kind,
        source: 'ai_generated',
        approval_status: 'draft',
        pools: input.pools,
        active: true,
        created_by: adminId,
        generation_batch_id: batch.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    for (const lang of LOCALES) {
      await upsertQuestionLocalization(
        db,
        row.id,
        toLocalizationInput(lang, q.localizations[lang]),
      );
    }
    questionIds.push(row.id);
  }
  return { batchId: batch.id, produced: accepted.length, rejected, questionIds };
}

/** Translates the existing localization(s) of a question into the languages it lacks. */
export async function fillMissingLanguages(
  db: Db,
  questionId: string,
  generator: QuestionGenerator | null = getQuestionGenerator(),
): Promise<AppLocale[]> {
  if (!generator)
    throw new QuestionGenError('Question generation is not configured', 'not_configured');
  const question = await getQuestion(db, questionId);
  if (!question) throw new QuestionGenError('Question not found', 'no_material');
  const present = new Set(question.question_localizations.map((l) => l.language as AppLocale));
  const missing = LOCALES.filter((l) => !present.has(l));
  if (missing.length === 0) return [];
  const sourceRow =
    question.question_localizations.find((l) => l.language === 'th') ??
    question.question_localizations[0];
  if (!sourceRow) throw new QuestionGenError('Write one language first', 'no_material');
  const source: GeneratedLocalization = {
    prompt: sourceRow.prompt,
    options: (sourceRow.options as unknown as QuestionOption[]).map((o) => ({
      key: o.key as 'A' | 'B' | 'C' | 'D',
      text: o.text,
    })),
    correct_key: sourceRow.correct_key as 'A' | 'B' | 'C' | 'D',
    explanation: sourceRow.explanation ?? '',
  };
  const translated = await generator.translate({
    sourceLanguage: sourceRow.language as AppLocale,
    source,
    targetLanguages: missing,
  });
  const written: AppLocale[] = [];
  for (const lang of missing) {
    const loc = translated[lang];
    if (!loc) continue;
    // The translation must mirror the source (keys, correct key, placeholders).
    if (translationProblem(source, loc)) continue;
    await upsertQuestionLocalization(db, questionId, toLocalizationInput(lang, loc));
    written.push(lang);
  }
  return written;
}

export async function listGenerationBatches(db: Db): Promise<GenerationBatchRow[]> {
  const { data, error } = await db
    .from('question_generation_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
