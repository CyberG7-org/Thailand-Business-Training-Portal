import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { RenderContext } from './context';
import { normalizeOption } from './format';
import { renderVariant, type Rendered, type RenderFailureCode } from './render';
import { validateVariant } from './validate';
import type { Variant } from './variant';

export type PreflightCode = RenderFailureCode | 'invalid' | 'empty_option' | 'duplicate_option';

export type PreflightResult =
  { ok: true; rendered: Rendered } | { ok: false; code: PreflightCode; detail: string };

/**
 * May this variant be asked of this company (spec §8)? It must keep the rules, render in Thai —
 * the language it is approved in — and come out as four non-empty options that differ after
 * normalisation, which also means no distractor equals the correct one.
 */
export function preflightVariant(
  variant: Variant,
  ctx: RenderContext,
  seed: string,
): PreflightResult {
  const issues = validateVariant(variant);
  if (issues.length > 0) return { ok: false, code: 'invalid', detail: issues[0].code };
  const result = renderVariant(variant, ctx, seed, 'th');
  if (!result.ok) return result;
  const seen = new Map<string, string>();
  for (const option of result.rendered.options) {
    const normal = normalizeOption(option.text);
    if (normal === '') return { ok: false, code: 'empty_option', detail: option.key };
    const earlier = seen.get(normal);
    if (earlier)
      return { ok: false, code: 'duplicate_option', detail: `${earlier} = ${option.key}` };
    seen.set(normal, option.key);
  }
  return result;
}

/** What one concept comes to for one company: the variant to ask, or why each one cannot be. */
export type ConceptCheck = {
  conceptKey: string;
  variant: Variant | null;
  rendered: Rendered | null;
  skipped: { key: string; code: PreflightCode; detail: string }[];
};

/**
 * The first approved variant of the concept, in key order, that passes preflight; a failing one
 * yields to the next (spec §8). P17e puts unseen variants first and raises `render_failure`
 * when none is left; here the caller only reads the answer.
 */
export function pickVariant(
  conceptKey: string,
  variants: readonly Variant[],
  ctx: RenderContext,
  seed: string,
): ConceptCheck {
  const candidates = variants
    .filter((v) => v.conceptKey === conceptKey && v.status === 'approved')
    .sort((a, b) => a.key.localeCompare(b.key));
  const skipped: ConceptCheck['skipped'] = [];
  for (const variant of candidates) {
    const result = preflightVariant(variant, ctx, `${seed}:${variant.id}`);
    if (result.ok) return { conceptKey, variant, rendered: result.rendered, skipped };
    skipped.push({ key: variant.key, code: result.code, detail: result.detail });
  }
  return { conceptKey, variant: null, rendered: null, skipped };
}

/** The thirty concepts in MCQ order, each with what the bank can ask this company. */
export function checkBank(
  variants: readonly Variant[],
  ctx: RenderContext,
  seed: string,
): ConceptCheck[] {
  return MCQ_CONCEPTS.map((concept) => pickVariant(concept.key, variants, ctx, seed));
}
