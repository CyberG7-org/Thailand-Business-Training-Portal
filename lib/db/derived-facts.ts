import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import { EMPTY_INTERVIEW_PROFILE, type InterviewProfile } from '@/lib/domain/bank-interview';
import {
  categoryInputHash,
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
  type CategoryAssignment,
} from '@/lib/domain/business-category';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import { getCategoryMapper } from '@/lib/integrations/category-map';
import type { CategoryMapper } from '@/lib/integrations/category-map/types';
import { listBusinessCategories } from './business-categories';
import type { Database, Json } from './database.types';
import { getDbdRecord } from './dbd-records';
import { geoLookup } from './geo';

type Db = SupabaseClient<Database>;

export type DerivedFactsDeps = {
  mapper: CategoryMapper | null;
  /** Tests pass it; otherwise the policy key is read. */
  minConfidencePercent?: number;
  now?: () => Date;
};

const defaultDeps = (): DerivedFactsDeps => ({ mapper: getCategoryMapper() });

/**
 * Re-derives what the record's own words imply (spec §5.2–5.3): the structured address when the
 * printed address changed, the category when the business text changed. Written with a
 * compare-and-set on `updated_at`, so an edit landing meanwhile wins and the next save derives
 * again. A mapper failure never throws: the category is stored unmapped with the reason.
 */
export async function refreshDerivedFacts(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
): Promise<'updated' | 'unchanged' | 'not_found' | 'raced'> {
  const record = await getDbdRecord(db, recordId);
  if (!record) return 'not_found';
  const stored = readStructuredData(record.structured_data);
  const at = (deps.now?.() ?? new Date()).toISOString();
  let changed = false;

  const printed = record.head_office_address?.replace(/\s+/g, ' ').trim() ?? '';
  let address = stored.address ?? null;
  if (!address || address.full !== printed) {
    address = await resolveRegisteredAddress(printed, geoLookup(db));
    changed = true;
  }

  const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
  const hash = categoryInputHash(interview.nature_of_business, interview.products_services);
  let category = stored.category ?? null;
  if (needsRemap(category, hash)) {
    category =
      hash === null
        ? failedCategory('no_text', null, at)
        : await mapCategory(db, interview, hash, deps, at);
    changed = true;
  }

  if (!changed) return 'unchanged';
  const { data, error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, address, category } as unknown as Json })
    .eq('id', recordId)
    .eq('updated_at', record.updated_at)
    .select('id');
  if (error) throw error;
  return data && data.length > 0 ? 'updated' : 'raced';
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
    const minConfidencePercent =
      deps.minConfidencePercent ?? (await getPolicy('business_category_min_confidence_percent'));
    return decideCategory({
      result,
      activeKeys: new Set(categories.map((c) => c.key)),
      minConfidencePercent,
      model: deps.mapper.model,
      inputHash: hash,
      at,
    });
  } catch (e) {
    return failedCategory(e instanceof Error ? e.message.slice(0, 300) : 'failed', hash, at);
  }
}

/** A person picks the category (staff, through RLS on the record); it holds until the text changes. */
export async function setBusinessCategory(
  db: Db,
  recordId: string,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new Error('not-found');
  const categories = await listBusinessCategories(db, { activeOnly: true });
  if (!categories.some((c) => c.key === key)) throw new Error('unknown-category');
  const stored = readStructuredData(record.structured_data);
  const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
  const category = manualCategory(
    key,
    categoryInputHash(interview.nature_of_business, interview.products_services),
    now.toISOString(),
  );
  const { error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, category } as unknown as Json })
    .eq('id', recordId);
  if (error) throw error;
}

/** "Map again": forget the stored decision and derive afresh. */
export async function remapBusinessCategory(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
): Promise<void> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new Error('not-found');
  const stored = readStructuredData(record.structured_data);
  const { error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, category: null } as unknown as Json })
    .eq('id', recordId);
  if (error) throw error;
  await refreshDerivedFacts(db, recordId, deps);
}
