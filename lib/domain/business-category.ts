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
