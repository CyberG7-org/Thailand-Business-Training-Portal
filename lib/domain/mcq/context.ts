import type { FactSheet } from '@/lib/domain/facts/fact-sheet';

/** A place by its two names; the geography tables carry no Chinese name. */
export type GeoName = { id: number; th: string; en: string };

/** A business category with its three labels; alternates are drawn from the active ones. */
export type CategoryLabel = { key: string; th: string; en: string; zh: string; active: boolean };

/**
 * Everything a variant is rendered from: the pinned facts, the registered address's own places
 * and their siblings (the other provinces of its region, the other districts of its province,
 * the other subdistricts of its district), and the category dictionary (spec §5.2, §5.3).
 */
export type RenderContext = {
  facts: FactSheet;
  geo: {
    province: GeoName | null;
    district: GeoName | null;
    subdistrict: GeoName | null;
    provinces: GeoName[];
    districts: GeoName[];
    subdistricts: GeoName[];
  };
  categories: CategoryLabel[];
};
