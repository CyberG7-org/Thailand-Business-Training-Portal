import {
  CATEGORY_RULES_VERSION,
  CATEGORY_TAXONOMY_VERSION,
  PRIMARY_CATEGORIES,
} from '@/lib/domain/category-taxonomy';
import type {
  CategoryMapInput,
  CategoryMapResult,
  CategoryMapper,
  CategoryEvidence,
} from './types';

type Field = 'primary_activity' | 'business_description' | 'products_services' | 'dbd_objectives';
const FIELD_WEIGHT: Record<Field, number> = {
  primary_activity: 5,
  business_description: 4,
  products_services: 2,
  dbd_objectives: 1,
};
const FIELD_ORDER: Field[] = [
  'primary_activity',
  'business_description',
  'products_services',
  'dbd_objectives',
];

/** NFKC preserves Thai combining marks; normalize punctuation/spacing without splitting Thai words. */
export function normalizeCategoryText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\u200b-\u200d]/g, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function positions(text: string, phrase: string): number[] {
  const result: number[] = [];
  const term = normalizeCategoryText(phrase);
  if (!term) return result;
  let index = text.indexOf(term);
  while (index >= 0) {
    const before = index ? text[index - 1] : '';
    const after = text[index + term.length] ?? '';
    if (
      (!/[a-z0-9]/.test(term[0]) || !/[a-z0-9]/.test(before)) &&
      (!/[a-z0-9]/.test(term[term.length - 1]) || !/[a-z0-9]/.test(after))
    )
      result.push(index);
    index = text.indexOf(term, index + term.length);
  }
  return result;
}

function explicitPrimary(text: string, phrase: string): boolean {
  const normalized = normalizeCategoryText(text);
  const term = normalizeCategoryText(phrase);
  const marker = /(?:ธุรกิจหลัก|กิจการหลัก|สินค้าหลัก|primary business|main business|primarily)/gu;
  for (const match of normalized.matchAll(marker)) {
    const window = normalized.slice(
      match.index + match[0].length,
      match.index + match[0].length + 60,
    );
    if (positions(window, term).length > 0) return true;
  }
  return false;
}

type Candidate = {
  key: string;
  score: number;
  primary: boolean;
  strong: number;
  concepts: Set<string>;
};

/** Pure, local, reproducible category decision; no provider credentials or network access. */
export class RulesCategoryMapper implements CategoryMapper {
  readonly name = 'rules' as const;
  readonly model = CATEGORY_RULES_VERSION;

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const fields: Record<Field, string> = {
      primary_activity: normalizeCategoryText(input.primaryActivity),
      business_description: normalizeCategoryText(input.natureOfBusiness),
      products_services: normalizeCategoryText(input.productsServices),
      dbd_objectives: normalizeCategoryText(input.dbdObjectives?.join(' ')),
    };
    const evidence: CategoryEvidence[] = [];
    const candidates: Candidate[] = PRIMARY_CATEGORIES.filter(
      (category) => category.key !== 'general_other',
    ).map((category) => {
      const concepts = new Set<string>();
      let score = 0;
      let primary = false;
      let strong = 0;
      for (const field of FIELD_ORDER) {
        const text = fields[field];
        if (!text) continue;
        for (const term of category.terms) {
          // One semantic concept per source field; the longest matching synonym wins.
          const found = term.phrases
            .filter((phrase) => positions(text, phrase).length > 0)
            .sort(
              (a, b) =>
                normalizeCategoryText(b).length - normalizeCategoryText(a).length ||
                a.localeCompare(b),
            )[0];
          if (!found) continue;
          const matchedPrimary =
            field === 'primary_activity' ||
            (field === 'business_description' && explicitPrimary(text, found));
          primary ||= matchedPrimary;
          const points = term.weight * FIELD_WEIGHT[field] + (matchedPrimary ? 30 : 0);
          evidence.push({
            categoryKey: category.key,
            phrase: found,
            sourceField: field,
            points,
            concept: term.concept,
          });
          score += points;
          concepts.add(term.concept);
          if (term.weight === 10) strong++;
        }
      }
      return { key: category.key, score, primary, strong, concepts };
    });
    evidence.sort(
      (a, b) =>
        a.categoryKey.localeCompare(b.categoryKey) ||
        FIELD_ORDER.indexOf(a.sourceField as Field) - FIELD_ORDER.indexOf(b.sourceField as Field) ||
        a.concept.localeCompare(b.concept),
    );
    const ranked = candidates.filter((candidate) => candidate.score > 0);
    if (!ranked.length)
      return {
        key: 'general_other',
        confidence: null,
        method: 'fallback',
        score: 0,
        evidenceLevel: 'none',
        matchedEvidence: [],
        secondaryCategoryKeys: [],
        taxonomyVersion: CATEGORY_TAXONOMY_VERSION,
        rulesVersion: CATEGORY_RULES_VERSION,
        fallbackReason: 'no_distinctive_evidence',
        explanation: 'No distinctive business product or activity matched the local rules.',
      };

    // Versioned mixed-activity precedence: diverse non-furniture goods beat an
    // incidental furniture mention unless furniture is explicitly primary.
    const furniture = ranked.find((candidate) => candidate.key === 'furniture_furnishings');
    const supplies = ranked.find((candidate) => candidate.key === 'household_office_kitchen');
    if (furniture && supplies && !furniture.primary && supplies.concepts.size >= 2)
      supplies.score += 30;

    // Real service activity outranks a secondary product mention.
    const collisionPairs = [
      ['electronics_device_repair', 'electronics_device_trading'],
      ['automotive_repair_services', 'automotive_parts_trading'],
      ['construction_installation_services', 'hardware_industrial_materials'],
      ['hair_beauty_services', 'beauty_cosmetics_products'],
      ['restaurant_cafe_catering', 'food_agricultural_trading'],
    ] as const;
    for (const [serviceKey, productKey] of collisionPairs) {
      const service = ranked.find((candidate) => candidate.key === serviceKey);
      const product = ranked.find((candidate) => candidate.key === productKey);
      if (service?.strong && product && !product.primary) service.score += 20;
    }

    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.primary) - Number(a.primary) ||
        b.strong - a.strong ||
        b.concepts.size - a.concepts.size ||
        a.key.localeCompare(b.key),
    );
    const first = ranked[0];
    const second = ranked[1];
    const lastResort = Boolean(
      second &&
      first.score === second.score &&
      first.primary === second.primary &&
      first.strong === second.strong &&
      first.concepts.size === second.concepts.size,
    );
    return {
      key: first.key,
      confidence: null,
      method: lastResort ? 'tie_break' : 'rules',
      score: first.score,
      evidenceLevel:
        first.primary || first.strong ? 'strong' : first.concepts.size > 1 ? 'moderate' : 'weak',
      matchedEvidence: evidence,
      secondaryCategoryKeys: ranked.slice(1, 4).map((candidate) => candidate.key),
      taxonomyVersion: CATEGORY_TAXONOMY_VERSION,
      rulesVersion: CATEGORY_RULES_VERSION,
      fallbackReason: null,
      explanation: lastResort
        ? `Equal evidence resolved by stable key order: ${first.key}.`
        : `Selected ${first.key} from ${first.concepts.size} independent matched concept(s).`,
    };
  }
}
