'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import {
  DocumentUploadError,
  confirmDbdRecord,
  createDbdRecord,
  getDbdRecord,
  listDbdDocuments,
  newDocumentPath,
  registerDbdDocument,
  removeDbdDocument,
  updateDbdRecord,
} from '@/lib/db/dbd-records';
import {
  askRecordDocuments,
  enqueueExtractJob,
  enqueueIndexJob,
  type AskResult,
} from '@/lib/db/dbd-index';
import { createSupabaseServerClient } from '@/lib/db/server';
import { answerFromPassages } from '@/lib/integrations/rag/answer';
import { VectorError, getVectorStore } from '@/lib/integrations/vector';
import { INTERVIEW_FIELDS, interviewProfileSchema } from '@/lib/domain/bank-interview';
import { checkDocumentFiles, type DocumentFileMeta } from '@/lib/domain/document-upload';
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
  /**
   * What happened to the reading after an upload that itself succeeded: `queued` = the cron
   * reads the documents in the background (D46), `skipped` = no extraction provider.
   */
  extraction?: 'queued' | 'skipped' | 'failed';
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
  const raw = e instanceof Error ? e.message : 'Unexpected error';
  // A record confirmed before the business answers were required still owes them, and says so
  // in the same words as the confirm checklist instead of a raw constraint name (D58).
  if (raw.includes('dbd_confirmed_requires_business_answers')) return 'answers-required';
  return raw;
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
  const missing = missingFieldsForConfirmation(
    record,
    readStructuredData(record.structured_data).interview ?? null,
  );
  if (missing.length > 0) return { ok: false, error: `missing:${missing.join(',')}` };
  try {
    await confirmDbdRecord(db, id, admin.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export type PreparedUpload = { path: string; token: string };
export type PrepareUploadsResult =
  { ok: true; id: string; uploads: PreparedUpload[] } | { ok: false; error: string };

/**
 * Step 1 of a browser-direct upload: validates what the admin picked (names, sizes, types only —
 * the bytes never pass through a function, which Vercel caps at 4.5 MB), creates the record when
 * there is none yet, and issues one signed upload URL per file under the record's prefix.
 */
export async function prepareUploadsAction(input: {
  locale: string;
  id: string | null;
  files: DocumentFileMeta[];
}): Promise<PrepareUploadsResult> {
  const admin = await requireAdmin(input.locale);
  const problem = checkDocumentFiles(input.files);
  if (problem) return { ok: false, error: problem };
  const db = await createSupabaseServerClient();
  try {
    const id = input.id ?? (await createDbdRecord(db, EMPTY_INPUT, admin.id)).id;
    const uploads: PreparedUpload[] = [];
    for (const file of input.files.filter((f) => f.size > 0)) {
      const path = newDocumentPath(id);
      const { data, error } = await db.storage.from('dbd-documents').createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message ?? `no upload URL for ${file.name}`);
      uploads.push({ path, token: data.token });
    }
    return { ok: true, id, uploads };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Step 2: the browser has put the files in the bucket; register each as a document of the
 * record, then read them (auto-fill). With `redirect`, the caller gets the record page URL to
 * navigate to (upload-first creation); otherwise the record page is revalidated in place.
 */
export async function registerUploadsAction(input: {
  locale: string;
  id: string;
  uploads: { path: string; name: string }[];
  redirect?: boolean;
}): Promise<ToolState & { redirectTo?: string }> {
  const { locale, id } = input;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  try {
    for (const upload of input.uploads) {
      await registerDbdDocument(db, id, { path: upload.path, originalName: upload.name });
    }
  } catch (e) {
    return { ok: false, error: e instanceof DocumentUploadError ? e.code : errorMessage(e) };
  }
  const outcome = await queueReading(db, id);
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  if (input.redirect) {
    const query = new URLSearchParams({ extraction: outcome.extraction ?? 'skipped' });
    if (outcome.extractionError) query.set('extractionError', outcome.extractionError);
    return {
      ok: true,
      error: null,
      ...outcome,
      redirectTo: `/${locale}/admin/dbd-records/${id}?${query.toString()}`,
    };
  }
  return { ok: true, error: null, ...outcome };
}

/**
 * Queues the reading of the record's documents (D46): the model needs longer than a request may
 * last, so the cron reads them and the page shows the fields on reload. A queueing failure never
 * undoes a successful upload.
 */
async function queueReading(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
): Promise<Pick<ToolState, 'applied' | 'extraction' | 'extractionError'>> {
  if (!getDbdExtractor()) return { extraction: 'skipped', applied: [] };
  try {
    const queued = await enqueueExtractJob(db, id);
    if (queued === 'no_document') {
      return { extraction: 'failed', applied: [], extractionError: 'no_document' };
    }
    return { extraction: 'queued', applied: [] };
  } catch (e) {
    return { extraction: 'failed', applied: [], extractionError: errorMessage(e) };
  }
}

export async function extractDocumentAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  if (!getDbdExtractor()) return { ok: false, error: 'not_configured' };
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not_allowed' };
  if (record.extraction_status === 'confirmed') return { ok: false, error: 'not_allowed' };
  const outcome = await queueReading(db, id);
  if (outcome.extraction === 'failed') {
    return { ok: false, error: outcome.extractionError ?? 'failed' };
  }
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  return { ok: true, error: null, ...outcome };
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record || record.extraction_status === 'confirmed') return;
  let unavailable = false;
  try {
    await removeDbdDocument(db, id, documentId);
  } catch (e) {
    // The store refused to drop the vectors, so the row was kept (no orphans); tell the admin.
    if (!(e instanceof VectorError)) throw e;
    unavailable = true;
  }
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  if (unavailable) redirect(`/${locale}/admin/dbd-records/${id}?error=vector_unavailable`);
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

export type AskState = AskResult;

/** "Ask the documents": retrieval + a grounded answer, never free-form knowledge (spec §8). */
export async function askDocumentsAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  return askRecordDocuments(db, getVectorStore(), {
    recordId: id,
    question: String(formData.get('question') ?? ''),
    answer: answerFromPassages,
  });
}
