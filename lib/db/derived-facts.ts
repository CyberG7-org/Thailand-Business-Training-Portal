import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { businessNature } from '@/lib/domain/business-natures';
import { categoryInputHash, failedCategory, manualCategory } from '@/lib/domain/business-category';
import { readStructuredData, type StructuredData } from '@/lib/domain/dbd-profile';
import { normalizeThai } from '@/lib/domain/thai-text';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import { createHash } from 'node:crypto';
import { getCategoryMapper } from '@/lib/integrations/category-map';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import { readBusinessPage } from '@/lib/integrations/extraction/business-page';
import { readFacebookPageWithApify } from '@/lib/integrations/extraction/apify-facebook';
import type { CategoryMapper } from '@/lib/integrations/category-map/types';
import type { Database, Json } from './database.types';
import { getDbdRecord, type DbdRecordRow } from './dbd-records';
import { geoLookup } from './geo';

type Db = SupabaseClient<Database>;

export type DerivedFactsDeps = {
  mapper: CategoryMapper | null;
  /** Writes one line for the kind of business from the objectives and the items sold (D101). */
  describe?: DbdExtractor['describeBusiness'] | null;
  readPage?: typeof readBusinessPage;
  readFacebook?: typeof readFacebookPageWithApify;
  now?: () => Date;
};

const defaultDeps = (): DerivedFactsDeps => {
  const extractor = getDbdExtractor();
  return {
    mapper: getCategoryMapper(),
    describe: extractor ? (input) => extractor.describeBusiness(input) : null,
  };
};

/** A change to the website or Facebook page describes the business again. */
function describeHash(pages: string[]): string | null {
  if (pages.length === 0) return null;
  return createHash('sha1').update(JSON.stringify(pages)).digest('hex');
}

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
  options: {
    remapCategory?: boolean;
    describe?: boolean;
    refreshFacebook?: boolean;
    attempts?: number;
  } = {},
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

      // Website/Facebook content is the only source for what the company does and sells.
      let interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
      let described = stored.described ?? null;
      let facebookSource = stored.facebook_source ?? null;
      const websiteText = record.website
        ? await (deps.readPage ?? readBusinessPage)(record.website)
        : null;
      let facebookText: string | null = null;
      if (record.facebook_page) {
        const sameUrl = facebookSource?.url === record.facebook_page;
        const failedRecently =
          facebookSource?.status === 'unavailable' &&
          Date.parse(at) - Date.parse(facebookSource.at) < 24 * 60 * 60 * 1000;
        if (
          sameUrl &&
          !options.refreshFacebook &&
          (facebookSource?.status === 'read' || failedRecently)
        ) {
          facebookText = facebookSource?.text ?? null;
        } else if (deps.readFacebook || deps.readPage || process.env.APIFY_API_TOKEN) {
          try {
            facebookText = await (deps.readFacebook ?? deps.readPage ?? readFacebookPageWithApify)(
              record.facebook_page,
            );
          } catch (error) {
            console.error('facebook page read', recordId, error);
          }
          facebookSource = {
            url: record.facebook_page,
            status: facebookText ? 'read' : 'unavailable',
            text: facebookText,
            at,
          };
          changed = true;
        }
      } else if (facebookSource) {
        facebookSource = null;
        changed = true;
      }
      const sourcePages = [websiteText, facebookText].filter((page): page is string =>
        Boolean(page),
      );
      const basis = describeHash(sourcePages);
      const wanted = deps.describe && basis !== null && described?.hash !== basis;
      if (wanted) {
        try {
          const written = await deps.describe!({ objectives: [], items: sourcePages });
          interview = {
            ...interview,
            nature_of_business: written.nature.trim() || interview.nature_of_business,
            products_services: written.products?.trim() || interview.products_services,
          };
          described = { hash: basis, confidence: written.confidence, at };
          changed = true;
        } catch (e) {
          console.error('describe business', recordId, e);
        }
      }

      const hash = categoryInputHash(interview.nature_of_business, interview.products_services);
      let category = stored.category ?? null;
      if (!category?.key || !businessNature(category.key)) {
        const reason = hash ? 'choose-category' : 'no_text';
        if (category?.error !== reason || category?.input_hash !== hash) {
          category = failedCategory(reason, hash, at);
          changed = true;
        }
      }

      return changed
        ? { ...stored, interview, described, facebook_source: facebookSource, address, category }
        : null;
    },
    options.attempts ?? 1,
    () => (repaired === null ? {} : { head_office_address: repaired }),
  );
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
  if (!businessNature(key)) throw new Error('unknown-category');
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
