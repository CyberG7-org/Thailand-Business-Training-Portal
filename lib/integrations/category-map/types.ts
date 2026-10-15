export type CategoryOption = { key: string; label_th: string; label_en: string };
export type CategoryMapInput = {
  natureOfBusiness: string;
  productsServices: string | null;
  categories: CategoryOption[];
  primaryActivity?: string | null;
  dbdObjectives?: string[];
};
export type CategoryEvidence = {
  categoryKey: string;
  phrase: string;
  sourceField: string;
  points: number;
  concept: string;
};
/** Legacy adapters may return a key/confidence only. The local rules always include the audit trace. */
export type CategoryMapResult = {
  key: string | null;
  confidence: number | null;
  method?: 'rules' | 'tie_break' | 'fallback';
  score?: number;
  evidenceLevel?: 'strong' | 'moderate' | 'weak' | 'none';
  matchedEvidence?: CategoryEvidence[];
  secondaryCategoryKeys?: string[];
  taxonomyVersion?: string;
  rulesVersion?: string;
  fallbackReason?: string | null;
  explanation?: string;
};

export interface CategoryMapper {
  readonly name: 'rules';
  /** Versioned local ruleset. */
  readonly model: string | null;
  map(input: CategoryMapInput): Promise<CategoryMapResult>;
}
