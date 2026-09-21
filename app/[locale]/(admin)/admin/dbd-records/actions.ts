'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { ExtractionError } from '@/lib/integrations/extraction/types';
import {
  confirmDbdRecord,
  createDbdRecord,
  getDbdRecord,
  listDbdDocuments,
  removeDbdDocument,
  updateDbdRecord,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { enqueueIndexJob, searchRecordPassages } from '@/lib/db/dbd-index';
import { extractAndApply } from '@/lib/db/extraction';
import { createSupabaseServerClient } from '@/lib/db/server';
import { answerFromPassages } from '@/lib/integrations/rag/answer';
import { getVectorStore } from '@/lib/integrations/vector';
import { INTERVIEW_FIELDS, interviewProfileSchema } from '@/lib/domain/bank-interview';
import { canRequestIndex, type IndexStatus } from '@/lib/domain/rag/index-status';
import {
  businessProfileSchema,
  parseListText,
  parseObjectivesText,
  parsePromotersText,
  parseShareholdersText,
  readStructuredData,
} from '@/lib/domain/dbd-profile';
import {
  dbdRecordInputSchema,
  missingFieldsForConfirmation,
  parseDirectorsText,
} from '@/lib/domain/dbd-record';

export type SaveState = { ok: boolean; error: string | null; fieldErrors: Record<string, string> };
export type ToolState = {
  ok: boolean;
  error: string | null;
  /** Fields filled from the document by the last upload/extract (P1.5, decision D37). */
  applied?: string[];
  /** Extraction outcome after an upload that itself succeeded. */
  extraction?: 'filled' | 'skipped' | 'failed';
  extractionError?: string;
};

const EMPTY_INPUT = dbdRecordInputSchema.parse({});

const TEXT_FIELDS = [
  'juristic_id',
  'certificate_no',
  'document_ref',
  'company_name_th',
  'company_name_en',
  'registered_on',
  'issued_on',
  'registered_capital',
  'head_office_address',
  'province',
  'signing_authority',
  'objectives_count',
  'issuing_office',
  'registrar_name',
] as const;

function formDataToInput(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) raw[f] = String(formData.get(f) ?? '');
  raw.directors = parseDirectorsText(String(formData.get('directors_text') ?? ''));
  return raw;
}

/** Level 2 textareas → business profile (decision D38); absent fields keep their stored value. */
function formDataToBusiness(formData: FormData, stored: ReturnType<typeof readStructuredData>) {
  const current = stored.business ?? businessProfileSchema.parse({});
  const has = (name: string) => formData.has(name);
  return businessProfileSchema.safeParse({
    objectives: has('objectives_text')
      ? parseObjectivesText(String(formData.get('objectives_text') ?? ''))
      : current.objectives,
    business_categories: has('business_categories_text')
      ? parseListText(String(formData.get('business_categories_text') ?? ''))
      : current.business_categories,
    share_structure: {
      total_shares: has('total_shares')
        ? String(formData.get('total_shares') ?? '')
        : current.share_structure.total_shares,
      par_value: has('par_value')
        ? String(formData.get('par_value') ?? '')
        : current.share_structure.par_value,
      paid_up_capital: has('paid_up_capital')
        ? String(formData.get('paid_up_capital') ?? '')
        : current.share_structure.paid_up_capital,
      share_type: has('share_type')
        ? String(formData.get('share_type') ?? '')
        : current.share_structure.share_type,
    },
    shareholders: has('shareholders_text')
      ? parseShareholdersText(String(formData.get('shareholders_text') ?? ''))
      : current.shareholders,
    promoters: has('promoters_text')
      ? parsePromotersText(String(formData.get('promoters_text') ?? ''))
      : current.promoters,
  });
}

/** Bank-interview answers (decision D39); absent fields keep their stored value. */
function formDataToInterview(formData: FormData, stored: ReturnType<typeof readStructuredData>) {
  const current = stored.interview ?? interviewProfileSchema.parse({});
  const raw: Record<string, unknown> = {};
  for (const field of INTERVIEW_FIELDS) {
    raw[field] = formData.has(`interview_${field}`)
      ? String(formData.get(`interview_${field}`) ?? '')
      : current[field];
  }
  return interviewProfileSchema.parse(raw);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Unexpected error';
}

export async function saveDbdRecordAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const parsed = dbdRecordInputSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? '_')] = issue.message;
    }
    return { ok: false, error: 'validation', fieldErrors };
  }

  const db = await createSupabaseServerClient();
  let createdId: string | null = null;
  try {
    if (id) {
      const existing = await getDbdRecord(db, id);
      if (!existing) return { ok: false, error: 'not-found', fieldErrors: {} };
      const stored = readStructuredData(existing.structured_data);
      const business = formDataToBusiness(formData, stored);
      if (!business.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of business.error.issues) {
          fieldErrors[String(issue.path[0] ?? 'business')] = issue.message;
        }
        return { ok: false, error: 'validation', fieldErrors };
      }
      await updateDbdRecord(db, id, parsed.data, { ...stored, business: business.data });
      revalidatePath(`/${locale}/admin/dbd-records/${id}`);
      return { ok: true, error: null, fieldErrors: {} };
    }
    const row = await createDbdRecord(db, parsed.data, admin.id);
    createdId = row.id;
  } catch (e) {
    return { ok: false, error: errorMessage(e), fieldErrors: {} };
  }
  // redirect() throws a control-flow signal, so it must stay outside the try block.
  redirect(`/${locale}/admin/dbd-records/${createdId}`);
}

export async function confirmDbdRecordAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not-found' };
  const missing = missingFieldsForConfirmation(record);
  if (missing.length > 0) return { ok: false, error: `missing:${missing.join(',')}` };
  try {
    await confirmDbdRecord(db, id, admin.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 6;

/** The "document" field may carry several PDFs (certificate, objectives sheet, บอจ.5, บอจ.2…). */
function pdfFiles(formData: FormData): File[] | 'no-file' | 'invalid-file' {
  const files = formData
    .getAll('document')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return 'no-file';
  if (files.length > MAX_FILES) return 'invalid-file';
  for (const f of files) {
    if (f.type !== 'application/pdf' || f.size > MAX_PDF_BYTES) return 'invalid-file';
  }
  return files;
}

export async function uploadDocumentAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const files = pdfFiles(formData);
  if (files === 'no-file' || files === 'invalid-file') return { ok: false, error: files };
  const db = await createSupabaseServerClient();
  try {
    for (const file of files) await uploadDbdDocument(db, id, file, file.name);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  const outcome = await fillFromDocument(db, id);
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  return { ok: true, error: null, ...outcome };
}

/** Runs extraction + auto-fill; an extraction failure never undoes a successful upload. */
async function fillFromDocument(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
): Promise<Pick<ToolState, 'applied' | 'extraction' | 'extractionError'>> {
  const extractor = getDbdExtractor();
  if (!extractor) return { extraction: 'skipped', applied: [] };
  try {
    const { applied } = await extractAndApply(db, id, extractor);
    return { extraction: 'filled', applied };
  } catch (e) {
    return {
      extraction: 'failed',
      applied: [],
      extractionError: e instanceof ExtractionError ? e.code : errorMessage(e),
    };
  }
}

/** Upload-first creation: new record + PDF + automatic fill, then straight to the review page. */
export async function createFromDocumentAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const admin = await requireAdmin(locale);
  const files = pdfFiles(formData);
  if (files === 'no-file' || files === 'invalid-file') return { ok: false, error: files };
  const db = await createSupabaseServerClient();
  let id: string;
  try {
    id = (await createDbdRecord(db, EMPTY_INPUT, admin.id)).id;
    for (const file of files) await uploadDbdDocument(db, id, file, file.name);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  const outcome = await fillFromDocument(db, id);
  const query = new URLSearchParams({ extraction: outcome.extraction ?? 'skipped' });
  if (outcome.applied?.length) query.set('applied', String(outcome.applied.length));
  if (outcome.extractionError) query.set('extractionError', outcome.extractionError);
  redirect(`/${locale}/admin/dbd-records/${id}?${query.toString()}`);
}

export async function extractDocumentAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const extractor = getDbdExtractor();
  if (!extractor) return { ok: false, error: 'not_configured' };
  const db = await createSupabaseServerClient();
  try {
    const { applied } = await extractAndApply(db, id, extractor);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null, applied, extraction: 'filled' };
  } catch (e) {
    if (e instanceof ExtractionError) return { ok: false, error: e.code };
    return { ok: false, error: errorMessage(e) };
  }
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record || record.extraction_status === 'confirmed') return;
  await removeDbdDocument(db, id, documentId);
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
}

/** Level 4 answers stay editable after confirmation: they are prepared answers, not DBD facts. */
export async function saveInterviewAnswersAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not-found' };
  const stored = readStructuredData(record.structured_data);
  try {
    const { error } = await db
      .from('dbd_records')
      .update({
        structured_data: { ...stored, interview: formDataToInterview(formData, stored) } as never,
      })
      .eq('id', id);
    if (error) throw error;
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Puts a failed or stuck document back in the queue from page 1 (P14). */
export async function retryIndexAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const doc = (await listDbdDocuments(db, id)).find((d) => d.id === documentId);
  if (!doc || !canRequestIndex(doc.index_status as IndexStatus)) return;
  await enqueueIndexJob(db, { recordId: id, documentId, kind: 'reindex' });
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
}

export type AskState = {
  question: string;
  answer: string | null;
  passages: { document: string; page: number; text: string }[];
  error: 'empty' | 'not_indexed' | 'unavailable' | null;
};

/** "Ask the documents": retrieval + a grounded answer, never free-form knowledge (spec §8). */
export async function askDocumentsAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const question = String(formData.get('question') ?? '')
    .trim()
    .slice(0, 300);
  await requireAdmin(locale);
  const empty: AskState = { question, answer: null, passages: [], error: null };
  if (question.length < 2) return { ...empty, error: 'empty' };
  const vector = getVectorStore();
  if (!vector) return { ...empty, error: 'unavailable' };
  const db = await createSupabaseServerClient();
  const docs = await listDbdDocuments(db, id);
  if (!docs.some((d) => d.index_status === 'ready')) return { ...empty, error: 'not_indexed' };
  const names = new Map(docs.map((d) => [d.id, d.original_name]));
  const passages = (await searchRecordPassages(vector, id, question, { topK: 5 })) ?? [];
  const answer = await answerFromPassages(question, passages, names);
  return {
    question,
    answer,
    passages: passages.map((p) => ({
      document: names.get(p.documentId) ?? '',
      page: p.page,
      text: p.text,
    })),
    error: null,
  };
}
