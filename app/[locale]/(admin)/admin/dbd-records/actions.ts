'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import {
  DocumentUploadError,
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
import { enqueueInvoicesJob } from '@/lib/db/invoices';
import { toFacebookPage, toWebAddress } from '@/lib/domain/learner-contact';
import type { PackLinks } from '@/lib/domain/pack/links';
import type { PackGroup } from '@/lib/domain/pack/sort';
import {
  refreshDerivedFacts,
  remapBusinessCategory,
  setBusinessCategory,
  updateStructuredData,
} from '@/lib/db/derived-facts';
import { createSupabaseServerClient } from '@/lib/db/server';
import {
  ValidationError,
  resolveException,
  validateAfterChange,
  validateRecord,
} from '@/lib/db/validation';
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
import { dbdRecordInputSchema, parseDirectorsText } from '@/lib/domain/dbd-record';

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

/** A manager's own team owns what they create; an admin's records belong to no team (spec §5.2). */
function teamOf(user: { id: string; role: 'learner' | 'manager' | 'admin' }): string | null {
  return user.role === 'manager' ? user.id : null;
}

function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'Unexpected error';
  // A record confirmed before the business answers were required still owes them, and says so
  // in the same words as the confirm checklist instead of a raw constraint name (D58).
  if (raw.includes('dbd_confirmed_requires_business_answers')) return 'answers-required';
  return raw;
}

/**
 * A save has succeeded; a failure to derive must not undo it (the next save derives again). The
 * record's facts may have changed with it (spec §5.5): the exceptions follow, and so do
 * acceptance and the version.
 */
async function deriveAfterSave(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
  actorId: string,
): Promise<void> {
  await refreshDerivedFacts(db, id).catch((e) => console.error('derived facts', id, e));
  await validateAfterChange(id, actorId);
}

export async function saveDbdRecordAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireStaff(locale);
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
      await updateDbdRecord(db, id, parsed.data, {
        ...stored,
        business: business.data,
        interview: formDataToInterview(formData, stored),
      });
      await deriveAfterSave(db, id, admin.id);
      revalidatePath(`/${locale}/admin/dbd-records/${id}`);
      return { ok: true, error: null, fieldErrors: {} };
    }
    const row = await createDbdRecord(
      db,
      parsed.data,
      admin.id,
      { interview: formDataToInterview(formData, readStructuredData(null)) },
      teamOf(admin),
    );
    createdId = row.id;
    await deriveAfterSave(db, row.id, admin.id);
  } catch (e) {
    return { ok: false, error: errorMessage(e), fieldErrors: {} };
  }
  // redirect() throws a control-flow signal, so it must stay outside the try block.
  redirect(`/${locale}/admin/dbd-records/${createdId}`);
}

/** "Check again" (plan decision 8): validation runs, and acceptance follows by itself when nothing blocks it. */
export async function recheckRecordAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not-found' };
  try {
    // "Check again" reads the address and the category again first: an address that did not
    // resolve is re-read every time, so a better reading reaches the record without a re-save.
    await refreshDerivedFacts(db, id).catch((e) => console.error('derived facts', id, e));
    const result = await validateRecord(createSupabaseAdminClient(), id, admin.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    if (!result) return { ok: false, error: 'not-found' };
    if (!result.accepted && record.extraction_status !== 'confirmed') {
      return { ok: false, error: 'blocked' };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A person settles an exception on the record page (spec §5.5); the record is checked again at once. */
export async function resolveExceptionAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const exceptionId = String(formData.get('exceptionId') ?? '');
  const resolution = formData.get('resolution') === 'dismissed' ? 'dismissed' : 'confirmed';
  const note = String(formData.get('note') ?? '');
  const staff = await requireStaff(locale);
  try {
    await resolveException(await createSupabaseServerClient(), {
      exceptionId,
      resolution,
      note,
      actorId: staff.id,
    });
    await validateAfterChange(id, staff.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    revalidatePath(`/${locale}/admin/exceptions`);
    return { ok: true, error: null };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ValidationError ? e.code.replace(/_/g, '-') : errorMessage(e),
    };
  }
}

export type PreparedUpload = { path: string; token: string };
export type PrepareUploadsResult =
  { ok: true; id: string; uploads: PreparedUpload[] } | { ok: false; error: string };

const packGroupSchema = z.enum(['pack', 'invoice', 'agreement']);
const isConfirmedSupplement = (status: string, groups: readonly PackGroup[]) =>
  status !== 'confirmed' || groups.every((group) => group !== 'pack');
/** The addresses as the browser read them; anything that is not an address is dropped. */
const packLinksSchema = z.object({
  website: z
    .string()
    .max(300)
    .nullish()
    .transform((v) => (v ? toWebAddress(v) : null)),
  facebook: z
    .string()
    .max(300)
    .nullish()
    .transform((v) => (v ? toFacebookPage(v) : null)),
});

/**
 * Step 1 of a browser-direct upload: validates what the admin picked (names, sizes, types only —
 * the bytes never pass through a function, which Vercel caps at 4.5 MB), creates the record when
 * there is none yet, and issues one signed upload URL per file under the record's prefix. A new
 * record from the "Create DBD" form carries the manager's four details from the start (D80).
 */
export async function prepareUploadsAction(input: {
  locale: string;
  id: string | null;
  files: (DocumentFileMeta & { group?: PackGroup })[];
}): Promise<PrepareUploadsResult> {
  const admin = await requireStaff(input.locale);
  const problem = checkDocumentFiles(input.files);
  if (problem) return { ok: false, error: problem };
  const db = await createSupabaseServerClient();
  try {
    const id =
      input.id ?? (await createDbdRecord(db, EMPTY_INPUT, admin.id, undefined, teamOf(admin))).id;
    if (input.id) {
      const record = await getDbdRecord(db, id);
      if (!record) return { ok: false, error: 'not-found' };
      const groups = input.files.map((file) => packGroupSchema.parse(file.group ?? 'pack'));
      if (!isConfirmedSupplement(record.extraction_status, groups)) {
        return { ok: false, error: 'invalid-file' };
      }
    }
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
  uploads: { path: string; name: string; group?: PackGroup }[];
  /** The company's addresses, read in the browser from the zip's link files (D101). */
  links?: PackLinks;
  redirect?: boolean;
}): Promise<ToolState & { redirectTo?: string }> {
  const { locale, id } = input;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  try {
    const record = await getDbdRecord(db, id);
    if (!record) return { ok: false, error: 'not-found' };
    const groups = input.uploads.map((upload) => packGroupSchema.parse(upload.group ?? 'pack'));
    if (!isConfirmedSupplement(record.extraction_status, groups)) {
      await db.storage.from('dbd-documents').remove(input.uploads.map((upload) => upload.path));
      return { ok: false, error: 'invalid-file' };
    }
    for (const upload of input.uploads) {
      await registerDbdDocument(db, id, {
        path: upload.path,
        originalName: upload.name,
        group: packGroupSchema.parse(upload.group ?? 'pack'),
      });
    }
    const links = packLinksSchema.parse(input.links ?? {});
    if (links.website || links.facebook) {
      const { error } = await db
        .from('dbd_records')
        .update({
          ...(links.website ? { website: links.website } : {}),
          ...(links.facebook ? { facebook_page: links.facebook } : {}),
        })
        .eq('id', id);
      if (error) throw error;
    }
  } catch (e) {
    return { ok: false, error: e instanceof DocumentUploadError ? e.code : errorMessage(e) };
  }
  const outcome = input.uploads.some((u) => (u.group ?? 'pack') === 'pack')
    ? await queueReading(db, id)
    : { extraction: 'skipped' as const, applied: [] };
  // The invoices have a read of their own (D101); a queueing failure never undoes the upload.
  if (input.uploads.some((u) => u.group === 'invoice') && getDbdExtractor()) {
    await enqueueInvoicesJob(db, id).catch((e) => console.error('invoices job', id, e));
  }
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
  await requireStaff(locale);
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

/** The company's website and Facebook page (D101): what the zip gave, corrected by hand. */
export async function saveLinksAction(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireStaff(locale);
  const website = String(formData.get('website') ?? '').trim();
  const facebook = String(formData.get('facebook_page') ?? '').trim();
  const links = {
    website: website ? toWebAddress(website) : null,
    facebook_page: facebook ? toFacebookPage(facebook) : null,
  };
  if ((website && !links.website) || (facebook && !links.facebook_page)) {
    return { ok: false, error: 'invalid' };
  }
  const db = await createSupabaseServerClient();
  const { error } = await db.from('dbd_records').update(links).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  return { ok: true, error: null };
}

/** Queues the invoice read again (D101): after invoices were added or removed, or a failure. */
export async function readInvoicesAgainAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireStaff(locale);
  await enqueueInvoicesJob(await createSupabaseServerClient(), id);
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return;
  const document = (await listDbdDocuments(db, id)).find((doc) => doc.id === documentId);
  if (!document || (record.extraction_status === 'confirmed' && document.group === 'pack')) return;
  let unavailable = false;
  try {
    await removeDbdDocument(db, id, documentId);
  } catch (e) {
    // The store refused to drop the vectors, so the row was kept (no orphans); tell the admin.
    if (!(e instanceof VectorError)) throw e;
    unavailable = true;
  }
  if (!unavailable && document.group === 'invoice') {
    const remaining = (await listDbdDocuments(db, id)).filter((doc) => doc.group === 'invoice');
    if (remaining.length > 0 && getDbdExtractor()) {
      await enqueueInvoicesJob(db, id);
    } else if (remaining.length === 0) {
      await updateStructuredData(db, id, (stored) => {
        const withoutInvoices = { ...stored };
        delete withoutInvoices.invoices;
        return withoutInvoices;
      });
      await refreshDerivedFacts(db, id, undefined, { describe: true }).catch((error) =>
        console.error('derived facts after removing invoices', id, error),
      );
      await validateAfterChange(id, null);
    }
  }
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
  if (unavailable)
    redirect(`/${locale}/admin/dbd-records/${id}?error=vector_unavailable&tab=documents`);
}

/** Level 4 answers stay editable after confirmation: they are prepared answers, not DBD facts. */
export async function saveInterviewAnswersAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const staff = await requireStaff(locale);
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
    await deriveAfterSave(db, id, staff.id);
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
  await requireStaff(locale);
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
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  return askRecordDocuments(db, getVectorStore(), {
    recordId: id,
    question: String(formData.get('question') ?? ''),
    answer: answerFromPassages,
  });
}

/** A person chooses the category (spec §5.3); it holds until the business text changes. */
export async function setBusinessCategoryAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const key = String(formData.get('categoryKey') ?? '');
  const staff = await requireStaff(locale);
  if (!key) return { ok: false, error: 'choose-category' };
  const db = await createSupabaseServerClient();
  try {
    await setBusinessCategory(db, id, key);
    await validateAfterChange(id, staff.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** "Map again": forget the stored decision and map afresh. */
export async function remapBusinessCategoryAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const staff = await requireStaff(locale);
  const db = await createSupabaseServerClient();
  try {
    await remapBusinessCategory(db, id);
    await validateAfterChange(id, staff.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
