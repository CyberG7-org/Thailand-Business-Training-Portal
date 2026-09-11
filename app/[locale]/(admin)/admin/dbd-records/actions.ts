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
  updateDbdRecord,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { runExtraction } from '@/lib/db/extraction';
import { createSupabaseServerClient } from '@/lib/db/server';
import {
  dbdRecordInputSchema,
  missingFieldsForConfirmation,
  parseDirectorsText,
} from '@/lib/domain/dbd-record';

export type SaveState = { ok: boolean; error: string | null; fieldErrors: Record<string, string> };
export type ToolState = { ok: boolean; error: string | null };

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
      await updateDbdRecord(db, id, parsed.data);
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

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function uploadDocumentAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const file = formData.get('document');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'no-file' };
  if (file.type !== 'application/pdf' || file.size > MAX_PDF_BYTES) {
    return { ok: false, error: 'invalid-file' };
  }
  const db = await createSupabaseServerClient();
  try {
    await uploadDbdDocument(db, id, file);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
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
    await runExtraction(db, id, extractor);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    if (e instanceof ExtractionError) return { ok: false, error: e.code };
    return { ok: false, error: errorMessage(e) };
  }
}
