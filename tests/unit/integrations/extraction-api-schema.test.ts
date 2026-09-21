import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import {
  dbdExtractionApiSchema,
  dbdExtractionSchema,
  fromApiExtraction,
} from '@/lib/integrations/extraction/schema';
import { SAMPLE_API_EXTRACTION } from './api-extraction-fixture';

/** Counts JSON-schema parameters whose type is a union (anyOf / type arrays) — the API caps these at 16. */
function unionCount(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, item) => n + unionCount(item), 0);
  const obj = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(obj.anyOf) || Array.isArray(obj.oneOf) || Array.isArray(obj.type)) count++;
  for (const value of Object.values(obj)) count += unionCount(value);
  return count;
}

const api = SAMPLE_API_EXTRACTION;

describe('extraction schema for the API', () => {
  it('has no union-typed parameters (the API rejects more than 16)', () => {
    const format = zodOutputFormat(dbdExtractionApiSchema) as unknown as { schema: unknown };
    expect(unionCount(format.schema)).toBe(0);
    // The stored/internal schema keeps nulls and is far over the limit — it must never be sent.
    const internal = zodOutputFormat(dbdExtractionSchema) as unknown as { schema: unknown };
    expect(unionCount(internal.schema)).toBeGreaterThan(16);
  });

  it('turns absent fields and sentinels back into the stored shape', () => {
    const out = fromApiExtraction(api);
    expect(dbdExtractionSchema.safeParse(out).success).toBe(true);
    expect(out.company_name_th).toEqual({
      value: 'บริษัท ทดสอบ จำกัด',
      confidence: 0.9,
      source_text: 'snippet',
      source_page: 2,
      source_document: 1,
    });
    expect(out.company_name_en).toEqual({
      value: null,
      confidence: 0,
      source_text: null,
      source_page: null,
      source_document: null,
    });
    expect(out.directors.value).toEqual([{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: null }]);
    expect(out.objectives.value).toEqual([
      { no: 1, text: 'ค้าปลีก' },
      { no: null, text: 'ไม่มีเลขข้อ' },
    ]);
    expect(out.share_structure.value).toEqual({
      total_shares: 20000,
      par_value: 100,
      paid_up_capital: null,
      share_type: null,
    });
    expect(out.shareholders.value?.[0]).toEqual({
      name: 'นางสาวตัวอย่าง ทดสอบ',
      nationality: 'ไทย',
      shares: 19998,
      percent: null,
    });
    expect(out.business_categories.value).toBeNull(); // absent list = null, like every absent field
    expect(out.documents[0]).toEqual({
      index: 1,
      document_type: 'certificate',
      title_as_printed: null,
      pages: null,
    });
  });
});
