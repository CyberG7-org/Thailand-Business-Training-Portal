import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import { FakeDbdExtractor, fakeClassify, fakePageText } from '@/lib/integrations/extraction/fake';
import {
  classifyApiSchema,
  mergeSweeps,
  sweepApiSchema,
  type SweepResult,
} from '@/lib/integrations/extraction/transcript-schema';

function unionCount(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, item) => n + unionCount(item), 0);
  const obj = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(obj.anyOf) || Array.isArray(obj.oneOf) || Array.isArray(obj.type)) count++;
  for (const value of Object.values(obj)) count += unionCount(value);
  return count;
}

describe('transcript-path schemas', () => {
  it('send no union-typed parameters', () => {
    for (const schema of [classifyApiSchema, sweepApiSchema]) {
      const format = zodOutputFormat(schema) as unknown as { schema: unknown };
      expect(unionCount(format.schema)).toBe(0);
    }
  });
});

describe('fake classification', () => {
  it('recognises the document kinds by their Thai headings and falls back to other', () => {
    expect(fakeClassify(fakePageText(1))).toBe('certificate');
    expect(fakeClassify(fakePageText(2))).toBe('objectives_sheet');
    expect(fakeClassify(fakePageText(3))).toBe('shareholder_list');
    expect(fakeClassify('หนังสือบริคณห์สนธิ (บอจ.2)')).toBe('memorandum');
    expect(fakeClassify('')).toBe('other');
    expect(fakeClassify('[หน้าว่าง]')).toBe('other');
  });
});

describe('mergeSweeps', () => {
  const a: SweepResult = {
    objectives: [
      { no: 1, text: 'ค้าปลีก' },
      { no: 2, text: 'ส่งออก' },
    ],
    shareholders: [{ name: 'นางสาว ก', nationality: 'ไทย', shares: 100, percent: null }],
    promoters: [],
    share_structure: {
      total_shares: 200,
      par_value: null,
      paid_up_capital: null,
      share_type: null,
    },
  };
  const b: SweepResult = {
    objectives: [
      { no: 2, text: 'ส่งออก' },
      { no: 3, text: 'บริการ' },
    ],
    shareholders: [
      { name: 'นางสาว ก', nationality: 'ไทย', shares: 100, percent: null }, // repeated across the page break
      { name: 'นาย ข', nationality: 'ไทย', shares: 100, percent: null },
    ],
    promoters: [{ name: 'นาย ข', nationality: null }],
    share_structure: { total_shares: null, par_value: 10, paid_up_capital: null, share_type: null },
  };

  it('concatenates in order, drops repeats, and keeps the first non-empty structure values', () => {
    const merged = mergeSweeps([a, b]);
    expect(merged.objectives.map((o) => o.no)).toEqual([1, 2, 3]);
    expect(merged.shareholders.map((s) => s.name)).toEqual(['นางสาว ก', 'นาย ข']);
    expect(merged.promoters).toEqual([{ name: 'นาย ข', nationality: null }]);
    expect(merged.share_structure).toEqual({
      total_shares: 200,
      par_value: 10,
      paid_up_capital: null,
      share_type: null,
    });
  });
});

describe('fake extractor transcript methods', () => {
  it('classifies, extracts the sample facts, and sweeps fictional lists', async () => {
    const fake = new FakeDbdExtractor();
    expect(await fake.classify(fakePageText(1))).toBe('certificate');
    const facts = await fake.extractFacts([
      { documentPosition: 1, page: 1, text: fakePageText(1) },
    ]);
    expect(facts.company_name_th.value).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(facts.shareholders.value).toBeNull();
    const swept = await fake.sweep([{ page: 3, text: fakePageText(3) }], 'shareholder_list');
    expect(swept.shareholders.length).toBeGreaterThan(0);
    expect(
      (await fake.sweep([{ page: 2, text: fakePageText(2) }], 'objectives_sheet')).objectives
        .length,
    ).toBe(3);
  });
});
