import type { SupabaseClient } from '@supabase/supabase-js';
import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import {
  isBusinessProfileEmpty,
  readStructuredData,
  type BusinessProfile,
  type Provenance,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import { applyExtractionToRecord, type RecordFormValues } from '@/lib/domain/extraction-merge';
import {
  dbdExtractionSchema,
  normalizeStoredExtraction,
} from '@/lib/integrations/extraction/schema';
import {
  ExtractionError,
  type DbdExtraction,
  type DbdExtractor,
} from '@/lib/integrations/extraction/types';
import type { Database, Json } from './database.types';
import { getDbdRecord, listDbdDocuments, updateDbdRecord, type DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;

/** Parses a stored `extraction_raw`, tolerating rows written before the three-level schema. */
export function parseStoredExtraction(raw: unknown): DbdExtraction | null {
  const parsed = dbdExtractionSchema.safeParse(normalizeStoredExtraction(raw));
  return parsed.success ? (parsed.data as DbdExtraction) : null;
}

/**
 * Runs the extractor over every uploaded document of the record (upload order) and stores the
 * raw result in `extraction_raw` (status `extracted`). Record columns are untouched here; the
 * fill step lives in `extractAndApply` (decision D37).
 */
export async function runExtraction(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
): Promise<DbdRecordRow> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new ExtractionError('Record not found', 'not_allowed');
  if (record.extraction_status === 'confirmed') {
    throw new ExtractionError('Confirmed records cannot be re-extracted', 'not_allowed');
  }
  const documents = await listDbdDocuments(db, recordId);
  if (documents.length === 0) {
    throw new ExtractionError('Upload the certificate PDF first', 'no_document');
  }

  const previousStatus = record.extraction_status;
  const { error: pendingError } = await db
    .from('dbd_records')
    .update({ extraction_status: 'pending' })
    .eq('id', recordId);
  if (pendingError) throw pendingError;

  try {
    const bytes: Uint8Array[] = [];
    for (const doc of documents) {
      const { data: blob, error } = await db.storage.from('dbd-documents').download(doc.path);
      if (error || !blob) {
        throw new ExtractionError(`Could not download ${doc.original_name}`, 'provider');
      }
      bytes.push(new Uint8Array(await blob.arrayBuffer()));
    }
    const extraction = await extractor.extract(bytes);

    // Level 3: remember what each uploaded document turned out to be.
    for (const info of extraction.documents ?? []) {
      const doc = documents[info.index - 1];
      if (doc && doc.document_type !== info.document_type) {
        await db
          .from('dbd_documents')
          .update({ document_type: info.document_type })
          .eq('id', doc.id);
      }
    }

    const { data, error } = await db
      .from('dbd_records')
      .update({ extraction_raw: extraction as unknown as Json, extraction_status: 'extracted' })
      .eq('id', recordId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    await db.from('dbd_records').update({ extraction_status: previousStatus }).eq('id', recordId);
    throw e;
  }
}

/** The record's columns as the strings the admin form shows (empty string = no value). */
export function recordToFormValues(record: DbdRecordRow): RecordFormValues {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    juristic_id: text(record.juristic_id),
    certificate_no: text(record.certificate_no),
    document_ref: text(record.document_ref),
    company_name_th: text(record.company_name_th),
    company_name_en: text(record.company_name_en),
    registered_on: text(record.registered_on),
    issued_on: text(record.issued_on),
    registered_capital: text(record.registered_capital),
    head_office_address: text(record.head_office_address),
    province: text(record.province),
    signing_authority: text(record.signing_authority),
    objectives_count: text(record.objectives_count),
    issuing_office: text(record.issuing_office),
    registrar_name: text(record.registrar_name),
    directors_text: directorsToText((record.directors as unknown as Director[] | null) ?? []),
  };
}

export type ExtractAndApplyResult = {
  record: DbdRecordRow;
  /** Form fields (Level 1/3) the extraction filled. */
  applied: string[];
  /** Fields whose extracted value failed validation and stayed empty. */
  rejected: string[];
  /** Whether the Level 2 business profile was filled from the documents. */
  businessFilled: boolean;
};

/** Level 2 as the extractor returned it, in the stored shape. */
function extractedBusinessProfile(extraction: DbdExtraction): BusinessProfile {
  return {
    objectives: (extraction.objectives.value ?? []).map((o) => ({ no: o.no, text: o.text })),
    business_categories: extraction.business_categories.value ?? [],
    share_structure: extraction.share_structure.value ?? {
      total_shares: null,
      par_value: null,
      paid_up_capital: null,
      share_type: null,
    },
    shareholders: (extraction.shareholders.value ?? []).map((s) => ({
      name: s.name,
      nationality: s.nationality,
      shares: s.shares,
      percent: s.percent,
    })),
    promoters: (extraction.promoters.value ?? []).map((p) => ({
      name: p.name,
      nationality: p.nationality,
    })),
  };
}

/** Level 3 provenance for every field that carries a value. */
function extractedProvenance(extraction: DbdExtraction): Provenance {
  const out: Provenance = {};
  for (const [key, entry] of Object.entries(extraction)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('confidence' in entry)) {
      continue;
    }
    const f = entry as {
      value: unknown;
      confidence: number;
      source_page: number | null;
      source_document: number | null;
    };
    const empty = f.value === null || (Array.isArray(f.value) && f.value.length === 0);
    if (empty) continue;
    out[key] = {
      confidence: f.confidence,
      source_page: f.source_page ?? null,
      source_document: f.source_document ?? null,
    };
  }
  return out;
}

/**
 * Runs the extractor and fills the record from what it read (decisions D37/D38): Level 1/3
 * columns only where empty, the Level 2 business profile only when nothing was entered yet,
 * provenance always refreshed. Confirmation stays explicit.
 */
export async function extractAndApply(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
): Promise<ExtractAndApplyResult> {
  const extracted = await runExtraction(db, recordId, extractor);
  const extraction = parseStoredExtraction(extracted.extraction_raw);
  if (!extraction) {
    throw new ExtractionError('The stored extraction is not readable', 'invalid_output');
  }
  const { input, applied, rejected } = applyExtractionToRecord(
    extraction,
    recordToFormValues(extracted),
  );

  const current = readStructuredData(extracted.structured_data);
  const currentBusiness = current.business ?? null;
  const business = extractedBusinessProfile(extraction);
  const businessFilled =
    (currentBusiness === null || isBusinessProfileEmpty(currentBusiness)) &&
    !isBusinessProfileEmpty(business);
  const structured: StructuredData = {
    business: businessFilled ? business : (currentBusiness ?? undefined),
    document_type: extraction.documents?.[0]?.document_type ?? current.document_type ?? null,
    provenance: extractedProvenance(extraction),
  };

  const record =
    applied.length > 0
      ? await updateDbdRecord(db, recordId, input, structured)
      : await updateStructuredData(db, recordId, structured);
  return { record, applied, rejected, businessFilled };
}

async function updateStructuredData(
  db: Db,
  recordId: string,
  structured: StructuredData,
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({ structured_data: structured as unknown as Json })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
