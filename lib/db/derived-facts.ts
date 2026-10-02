import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_INTERVIEW_PROFILE, type InterviewProfile } from '@/lib/domain/bank-interview';
import {
  categoryInputHash,
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
  type CategoryAssignment,
} from '@/lib/domain/business-category';
import { readStructuredData, type StructuredData } from '@/lib/domain/dbd-profile';
import { normalizeThai } from '@/lib/domain/thai-text';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import { getCategoryMapper } from '@/lib/integrations/category-map';
import type { CategoryMapper } from '@/lib/integrations/category-map/types';
import { listBusinessCategories } from './business-categories';
import type { Database, Json } from './database.types';
import { getDbdRecord, type DbdRecordRow } from './dbd-records';
import { geoLookup } from './geo';

type Db = SupabaseClient<Database>;

export type DerivedFactsDeps = {
  mapper: CategoryMapper | null;
  now?: () => Date;
};

const defaultDeps = (): DerivedFactsDeps => ({ mapper: getCategoryMapper() });

/** How often a person's explicit choice is retried against edits landing meanwhile. */
const CAS_ATTEMPTS = 3;

export type StructuredDataUpdate = 'updated' | 'unchanged' | 'not_found' | 'raced';

/**
 * Read → mutate → write, compared-and-set on `updated_at`, so an edit landing between the read
 * and the write (a background reading, another staff save) is never overwritten by a stale
 * snapshot: the write is refused, the record re-read and mutated again, up to `attempts` times.
 * `mutate` returns the whole structured data to store, or null when nothing changed. `columns`
 * names record columns to write in the same statement (the address a resolution repaired).
 */
export async function updateStructuredData(
  db: Db,
  recordId: string,
  mutate: (
    stored: StructuredData,
    record: DbdRecordRow,
  ) => Promise<StructuredData | null> | StructuredData | null,
  attempts = CAS_ATTEMPTS,
  columns: () => { head_office_address?: string } = () => ({}),
): Promise<StructuredDataUpdate> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const record = await getDbdRecord(db, recordId);
    if (!record) return 'not_found';
    const next = await mutate(readStructuredData(record.structured_data), record);
    if (next === null) return 'unchanged';
    const { data, error } = await db
      .from('dbd_records')
      .update({ structured_data: next as unknown as Json, ...columns() })
      .eq('id', recordId)
      .eq('updated_at', record.updated_at)
      .select('id');
    if (error) throw error;
    if (data && data.length > 0) return 'updated';
  }
  return 'raced';
}

/**
 * Re-derives what the record's own words imply (spec §5.2–5.3): the structured address when the
 * printed address changed, the category when the business text changed (or on request). One
 * attempt by default: an edit landing meanwhile wins and its own save derives again. A mapper
 * failure never throws: the category is stored unmapped with the reason.
 */
export async function refreshDerivedFacts(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
  options: { remapCategory?: boolean; attempts?: number } = {},
): Promise<StructuredDataUpdate> {
  // The printed address with the marks a reader dropped put back (D92), when a resolution did.
  let repaired: string | null = null;
  return updateStructuredData(
    db,
    recordId,
    async (stored, record) => {
      const at = (deps.now?.() ?? new Date()).toISOString();
      let changed = false;

      const printed = normalizeThai(record.head_office_address ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      let address = stored.address ?? null;
      // An address that did not resolve is read again every time: the reading may have improved,
      // and three lookups cost nothing.
      if (!address || address.full !== printed || address.status !== 'resolved') {
        address = await resolveRegisteredAddress(printed, geoLookup(db));
        changed = true;
      }
      // A place name or หมู่ got its marks back: the record's own address says so too, so the
      // form, the name card and the questions all show the address as it is printed.
      repaired = address.full !== printed ? address.full : null;

      const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
      const hash = categoryInputHash(interview.nature_of_business, interview.products_services);
      let category = stored.category ?? null;
      if (options.remapCategory || needsRemap(category, hash)) {
        category =
          hash === null
            ? failedCategory('no_text', null, at)
            : await mapCategory(db, interview, hash, deps, at);
        changed = true;
      }

      return changed ? { ...stored, address, category } : null;
    },
    options.attempts ?? 1,
    () => (repaired === null ? {} : { head_office_address: repaired }),
  );
}

async function mapCategory(
  db: Db,
  interview: InterviewProfile,
  hash: string,
  deps: DerivedFactsDeps,
  at: string,
): Promise<CategoryAssignment> {
  if (!deps.mapper) return failedCategory('not_configured', hash, at);
  try {
    const categories = await listBusinessCategories(db, { activeOnly: true });
    if (categories.length === 0) return failedCategory('no_categories', hash, at);
    const result = await deps.mapper.map({
      natureOfBusiness: interview.nature_of_business ?? '',
      productsServices: interview.products_services,
      categories: categories.map((c) => ({
        key: c.key,
        label_th: c.label_th,
        label_en: c.label_en,
      })),
    });
    return decideCategory({
      result,
      activeKeys: new Set(categories.map((c) => c.key)),
      model: deps.mapper.model,
      inputHash: hash,
      at,
    });
  } catch (e) {
    return failedCategory(e instanceof Error ? e.message.slice(0, 300) : 'failed', hash, at);
  }
}

/**
 * A person picks the category (staff, through RLS on the record); it holds until the business
 * text changes. Retried against edits landing meanwhile; `raced` when they keep coming.
 */
export async function setBusinessCategory(
  db: Db,
  recordId: string,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  const categories = await listBusinessCategories(db, { activeOnly: true });
  if (!categories.some((c) => c.key === key)) throw new Error('unknown-category');
  const result = await updateStructuredData(db, recordId, (stored) => {
    const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
    const hash = categoryInputHash(interview.nature_of_business, interview.products_services);
    return { ...stored, category: manualCategory(key, hash, now.toISOString()) };
  });
  if (result === 'not_found') throw new Error('not-found');
  if (result === 'raced') throw new Error('raced');
}

/** "Map again": derive the category afresh, whatever is stored; same retry as a manual choice. */
export async function remapBusinessCategory(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
): Promise<void> {
  const result = await refreshDerivedFacts(db, recordId, deps, {
    remapCategory: true,
    attempts: CAS_ATTEMPTS,
  });
  if (result === 'not_found') throw new Error('not-found');
  if (result === 'raced') throw new Error('raced');
}
