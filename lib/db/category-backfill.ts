import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { BUSINESS_NATURES } from '@/lib/domain/business-natures';
import { categoryInputHash, decideCategory, needsRemap } from '@/lib/domain/business-category';
import { CATEGORY_RULES_VERSION, PRIMARY_CATEGORIES } from '@/lib/domain/category-taxonomy';
import { readStructuredData, type StructuredData } from '@/lib/domain/dbd-profile';
import { RulesCategoryMapper } from '@/lib/integrations/category-map/rules';
import type { Database } from './database.types';
import { updateStructuredData } from './derived-facts';

type Db = SupabaseClient<Database>;
const mapper = new RulesCategoryMapper();
const activeKeys = new Set(PRIMARY_CATEGORIES.map(({ key }) => key));
const categories = PRIMARY_CATEGORIES.map(({ key, th, en }) => ({
  key,
  label_th: th,
  label_en: en,
}));

function inputFor(stored: StructuredData) {
  const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
  const objectives = [
    ...(stored.business?.objectives.map((item) => item.text) ?? []),
    ...(stored.business?.business_categories ?? []),
  ];
  return {
    hash:
      categoryInputHash(interview.nature_of_business, interview.products_services, objectives) ??
      'empty',
    mapping: {
      natureOfBusiness: interview.nature_of_business ?? '',
      productsServices: interview.products_services,
      dbdObjectives: objectives,
      categories,
    },
  };
}

export type CategoryBackfillSummary = {
  considered: number;
  pending: number;
  applied: number;
  skippedManual: number;
  skippedUnprocessed: number;
  raced: number;
};

/** Dry-run by default. Apply only through an explicitly requested maintenance flow.
 * Reads stored extracted text; never reopens documents or invokes any external API. */
export async function backfillPrimaryCategories(
  db: Db,
  options: { apply?: boolean; recordIds?: string[] } = {},
): Promise<CategoryBackfillSummary> {
  const summary: CategoryBackfillSummary = {
    considered: 0,
    pending: 0,
    applied: 0,
    skippedManual: 0,
    skippedUnprocessed: 0,
    raced: 0,
  };
  if (options.recordIds?.length === 0) return summary;
  let offset = 0;
  while (true) {
    let query = db
      .from('dbd_records')
      .select('id, extraction_status, extraction_raw, structured_data')
      .order('id')
      .range(offset, offset + 199);
    if (options.recordIds) query = query.in('id', options.recordIds);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      summary.considered++;
      const stored = readStructuredData(row.structured_data);
      if (
        !stored.source_image &&
        !row.extraction_raw &&
        !['extracted', 'confirmed'].includes(row.extraction_status)
      ) {
        summary.skippedUnprocessed++;
        continue;
      }
      if (stored.category?.source === 'manual') {
        summary.skippedManual++;
        continue;
      }
      const { hash } = inputFor(stored);
      if (!needsRemap(stored.category ?? null, hash, CATEGORY_RULES_VERSION)) continue;
      summary.pending++;
      if (!options.apply) continue;
      const result = await updateStructuredData(db, row.id, async (current) => {
        if (current.category?.source === 'manual') return null;
        const currentInput = inputFor(current);
        if (!needsRemap(current.category ?? null, currentInput.hash, CATEGORY_RULES_VERSION))
          return null;
        const mapped = await mapper.map(currentInput.mapping);
        const previousFiguresKey =
          current.category?.legacy_figures_key ??
          (BUSINESS_NATURES.some(([key]) => key === current.category?.key)
            ? current.category?.key
            : null);
        return {
          ...current,
          category_backfill_previous:
            current.category_backfill_previous ?? current.category ?? null,
          category: {
            ...decideCategory({
              result: mapped,
              activeKeys,
              model: mapper.model,
              inputHash: currentInput.hash,
              at: new Date().toISOString(),
            }),
            ...(previousFiguresKey ? { legacy_figures_key: previousFiguresKey } : {}),
          },
        };
      });
      if (result === 'updated') summary.applied++;
      else if (result === 'raced') summary.raced++;
    }
    if (!data || data.length < 200) break;
    offset += 200;
  }
  return summary;
}

/** Reverts only a backfilled automatic v2 decision. Later manual choices are never touched. */
export async function restoreBackfilledCategory(db: Db, recordId: string) {
  return updateStructuredData(db, recordId, (stored) => {
    if (
      !stored.category_backfill_previous ||
      stored.category?.source !== 'auto' ||
      stored.category.model !== CATEGORY_RULES_VERSION
    )
      return null;
    return {
      ...stored,
      category: stored.category_backfill_previous,
      category_backfill_previous: null,
    };
  });
}
