import { z } from 'zod';
import type { CategoryMapResult } from '@/lib/integrations/category-map/types';

/**
 * The record's business category (spec 2026-09-30 §5.3, D73), stored under
 * `structured_data.category`. `key` is set only when mapped (automatically at or above the
 * confidence threshold, or by a person); `candidate_key` holds a low-confidence suggestion.
 * Pure — this module reaches client bundles through `dbd-profile.ts`.
 */
export const categoryAssignmentSchema = z.object({
  key: z.string().nullable(),
  candidate_key: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.enum(['auto', 'manual']).nullable(),
  status: z.enum(['mapped', 'needs_review', 'unmapped']),
  model: z.string().nullable(),
  input_hash: z.string().nullable(),
  error: z.string().nullable(),
  decided_at: z.string().nullable(),
  method: z.enum(['rules', 'tie_break', 'fallback']).optional(),
  score: z.number().optional(),
  evidence_level: z.enum(['strong', 'moderate', 'weak', 'none']).optional(),
  matched_evidence: z
    .array(
      z.object({
        categoryKey: z.string(),
        phrase: z.string(),
        sourceField: z.string(),
        points: z.number(),
        concept: z.string(),
      }),
    )
    .optional(),
  secondary_category_keys: z.array(z.string()).optional(),
  taxonomy_version: z.string().optional(),
  rules_version: z.string().optional(),
  fallback_reason: z.string().nullable().optional(),
  explanation: z.string().optional(),
  /** Preserves the pre-backfill illustrative figures when 40 old categories merge to 25. */
  legacy_figures_key: z.string().optional(),
});
export type CategoryAssignment = z.output<typeof categoryAssignmentSchema>;

export function categoryFiguresKey(
  category: Pick<CategoryAssignment, 'key' | 'legacy_figures_key'> | null | undefined,
): string | null {
  return category?.legacy_figures_key ?? category?.key ?? null;
}

/**
 * FNV-1a over the business text, so the category is re-mapped only when the words change.
 * Null without a nature of business: there is nothing to map.
 */
export function categoryInputHash(
  natureOfBusiness: string | null,
  productsServices: string | null,
  objectiveTexts: readonly string[] = [],
  registeredCategories: readonly string[] = [],
): string | null {
  const nature = (natureOfBusiness ?? '').replace(/\s+/g, ' ').trim();
  const products = (productsServices ?? '').replace(/\s+/g, ' ').trim();
  const objectives = objectiveTexts.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const registered = registeredCategories
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!nature && !products && objectives.length === 0 && registered.length === 0) return null;
  const text = `${nature}\n${products}\n${objectives.join('\n')}\n${registered.join('\n')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The mapper's answer as a stored decision: its best match is the category, whatever the
 * confidence (D90, superseding the threshold of spec §5.3); a key that is not an active category
 * is discarded.
 */
export function decideCategory(input: {
  result: CategoryMapResult;
  activeKeys: ReadonlySet<string>;
  model: string | null;
  inputHash: string;
  at: string;
}): CategoryAssignment {
  const { result } = input;
  const known = result.key !== null && input.activeKeys.has(result.key);
  const base = {
    confidence: result.confidence,
    source: 'auto' as const,
    model: input.model,
    input_hash: input.inputHash,
    error: null,
    decided_at: input.at,
    ...(result.method
      ? {
          method: result.method,
          score: result.score ?? 0,
          evidence_level: result.evidenceLevel ?? 'none',
          matched_evidence: result.matchedEvidence ?? [],
          secondary_category_keys: result.secondaryCategoryKeys ?? [],
          taxonomy_version: result.taxonomyVersion ?? '',
          rules_version: result.rulesVersion ?? '',
          fallback_reason: result.fallbackReason ?? null,
          explanation: result.explanation ?? '',
        }
      : {}),
  };
  if (!known) return { ...base, key: null, candidate_key: null, status: 'unmapped' };
  return { ...base, key: result.key, candidate_key: null, status: 'mapped' };
}

/**
 * A decision stored while a weak match still waited for a person (before D90): its candidate
 * is the category now. Read through here, so the next save stores it that way.
 */
export function settleCategory(category: CategoryAssignment): CategoryAssignment {
  if (category.status !== 'needs_review' || !category.candidate_key) return category;
  return { ...category, key: category.candidate_key, candidate_key: null, status: 'mapped' };
}

/** A person's choice; it holds until the business text changes. */
export function manualCategory(
  key: string,
  inputHash: string | null,
  at: string,
): CategoryAssignment {
  return {
    key,
    candidate_key: null,
    confidence: null,
    source: 'manual',
    status: 'mapped',
    model: null,
    input_hash: inputHash,
    error: null,
    decided_at: at,
  };
}

/** Nothing mapped, with the reason (`no_text`, `not_configured`, `no_categories`, or an error). */
export function failedCategory(
  error: string,
  inputHash: string | null,
  at: string,
): CategoryAssignment {
  return {
    key: null,
    candidate_key: null,
    confidence: null,
    source: null,
    status: 'unmapped',
    model: null,
    input_hash: inputHash,
    error,
    decided_at: at,
  };
}

/** Re-map when the business words or automatic mapping rules changed. */
export function needsRemap(
  current: CategoryAssignment | null,
  inputHash: string | null,
  model?: string | null,
): boolean {
  if (!current) return true;
  return current.input_hash !== inputHash || (model !== undefined && current.model !== model);
}
