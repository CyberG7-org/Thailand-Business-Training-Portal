import { z } from 'zod';

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
});
export type CategoryAssignment = z.output<typeof categoryAssignmentSchema>;

/**
 * FNV-1a over the business text, so the category is re-mapped only when the words change.
 * Null without a nature of business: there is nothing to map.
 */
export function categoryInputHash(
  natureOfBusiness: string | null,
  productsServices: string | null,
): string | null {
  const nature = (natureOfBusiness ?? '').replace(/\s+/g, ' ').trim();
  if (!nature) return null;
  const products = (productsServices ?? '').replace(/\s+/g, ' ').trim();
  const text = `${nature}\n${products}`;
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
  result: { key: string | null; confidence: number };
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

/** Re-map when the business words changed since the stored decision, and only then. */
export function needsRemap(current: CategoryAssignment | null, inputHash: string | null): boolean {
  if (!current) return true;
  return current.input_hash !== inputHash;
}
