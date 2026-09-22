import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOCALES, type AppLocale } from '@/i18n/routing';
import type { OptionKey, QuestionOption } from '@/lib/domain/assessment/engine';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { getQuestionGenerator } from '@/lib/integrations/question-gen';
import {
  bannedLiterals,
  type DbdReferenceRecord,
} from '@/lib/integrations/question-gen/dbd-reference';
import { resolveSourceRefs } from '@/lib/integrations/question-gen/passages';
import {
  QuestionGenError,
  type GeneratedLocalization,
  type MaterialBundle,
  type QuestionGenerator,
} from '@/lib/integrations/question-gen/types';
import { MAX_GENERATION_COUNT } from '@/lib/domain/generation-limits';
import { getVectorStore, type VectorStore } from '@/lib/integrations/vector';
import {
  translationProblem,
  validateGenerated,
  type Rejection,
} from '@/lib/integrations/question-gen/validate';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { Database, Json } from './database.types';
import { loadReferencePassages } from './passages';
import { getQuestion, upsertQuestionLocalization } from './questions';

type Db = SupabaseClient<Database>;
export type GenerationBatchRow = Database['public']['Tables']['question_generation_batches']['Row'];

export type GenerateBankInput = {
  /** Confirmed DBD record the questions are modelled on (decision D36); null = structure only. */
  referenceRecordId: string | null;
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

const MAX_COUNT = MAX_GENERATION_COUNT;

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

/** The reference record's particulars plus its stored certificate PDF, when one was uploaded. */
export async function loadReference(
  db: Db,
  recordId: string,
): Promise<{ record: DbdReferenceRecord; pdf: Uint8Array | null }> {
  const { data, error } = await db.from('dbd_records').select('*').eq('id', recordId).maybeSingle();
  if (error) throw error;
  if (!data) throw new QuestionGenError('Reference record not found', 'no_material');
  const record: DbdReferenceRecord = {
    company_name_th: data.company_name_th,
    company_name_en: data.company_name_en,
    juristic_id: data.juristic_id,
    certificate_no: data.certificate_no,
    registered_on: data.registered_on,
    issued_on: data.issued_on,
    registered_capital: data.registered_capital,
    head_office_address: data.head_office_address,
    directors: (data.directors as unknown as Director[] | null) ?? null,
    signing_authority: data.signing_authority,
    objectives_count: data.objectives_count,
    issuing_office: data.issuing_office,
    registrar_name: data.registrar_name,
    province: data.province,
    business: readStructuredData(data.structured_data).business ?? null,
    interview: readStructuredData(data.structured_data).interview ?? null,
  };
  // Attach the stored certificate only when it is small enough to read whole (D42); big packs are
  // reached through passages instead. Unknown page counts are uploads from before P14: attach.
  let pdf: Uint8Array | null = null;
  if (data.document_path) {
    const { data: first } = await db
      .from('dbd_documents')
      .select('page_count')
      .eq('record_id', recordId)
      .order('position')
      .limit(1)
      .maybeSingle();
    const pages = first?.page_count ?? null;
    if (pages === null || pages <= directReadMaxPages()) {
      const { data: blob } = await db.storage.from('dbd-documents').download(data.document_path);
      if (blob) pdf = new Uint8Array(await blob.arrayBuffer());
    }
  }
  return { record, pdf };
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
  vector: VectorStore | null = getVectorStore(),
): Promise<GenerateBankResult> {
  if (!generator)
    throw new QuestionGenError('Question generation is not configured', 'not_configured');
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(input.count)));
  const templateCount = Math.max(0, Math.min(count, Math.floor(input.templateCount)));
  const [material, reference] = await Promise.all([
    buildMaterial(db, input),
    input.referenceRecordId ? loadReference(db, input.referenceRecordId) : null,
  ]);
  // Retrieved passages replace the whole-PDF block when the reference record is indexed (D43).
  const passages =
    reference && input.referenceRecordId
      ? await loadReferencePassages(db, vector, input.referenceRecordId)
      : [];

  const generated = await generator.generate({
    reference,
    passages,
    material,
    count,
    templateCount,
    difficulty: input.difficulty,
    focus: input.focus,
  });
  const { accepted, rejected } = validateGenerated(generated, {
    bannedLiterals: reference ? bannedLiterals(reference.record) : [],
  });

  const summary = [
    reference ? `DBD ${reference.record.juristic_id ?? input.referenceRecordId}` : null,
    passages.length ? `${passages.length} passages` : null,
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
      material_summary: summary || 'DBD certificate structure only',
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
        source_refs: resolveSourceRefs(q.sources, passages) as unknown as Json,
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
