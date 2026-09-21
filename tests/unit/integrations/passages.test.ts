import { describe, expect, it } from 'vitest';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import {
  MAX_PASSAGE_CHARS,
  passagesBlock,
  resolveSourceRefs,
  type ReferencePassage,
} from '@/lib/integrations/question-gen/passages';
import { validateGenerated } from '@/lib/integrations/question-gen/validate';

const passages: ReferencePassage[] = [
  {
    id: 'd#1#0',
    group: 'identity',
    documentId: 'd',
    documentName: 'cert.pdf',
    documentType: 'certificate',
    page: 1,
    text: 'ทุนจดทะเบียน 2,000,000 บาท',
  },
  {
    id: 'd#3#0',
    group: 'ownership',
    documentId: 'd',
    documentName: 'cert.pdf',
    documentType: 'shareholder_list',
    page: 3,
    text: 'ก'.repeat(5000),
  },
];

describe('passagesBlock', () => {
  it('numbers passages, labels group/document/page and caps the text', () => {
    const block = passagesBlock(passages);
    expect(block).toContain('[1] (identity) cert.pdf, หน้า 1\nทุนจดทะเบียน 2,000,000 บาท');
    expect(block).toContain('[2] (ownership) cert.pdf, หน้า 3\n');
    expect(block.length).toBeLessThan(MAX_PASSAGE_CHARS + 200);
  });
});

describe('resolveSourceRefs', () => {
  it('maps cited numbers to document/page refs, dropping unknown and duplicate ones', () => {
    expect(resolveSourceRefs([1, 1, 2, 9, 0, 1.5], passages)).toEqual([
      { document_id: 'd', document_name: 'cert.pdf', document_type: 'certificate', page: 1 },
      { document_id: 'd', document_name: 'cert.pdf', document_type: 'shareholder_list', page: 3 },
    ]);
    expect(resolveSourceRefs(undefined, passages)).toEqual([]);
    expect(resolveSourceRefs([1], [])).toEqual([]);
  });
});

describe('fake generator with passages', () => {
  const input = {
    reference: null,
    material: { text: '', pdf: null },
    count: 3,
    templateCount: 2,
    difficulty: 'medium' as const,
    focus: null,
  };

  it('cites passages in turn when some are given, none otherwise', async () => {
    const withPassages = await new FakeQuestionGenerator().generate({ ...input, passages });
    expect(withPassages.map((q) => q.sources)).toEqual([[1], [2], [1]]);
    const without = await new FakeQuestionGenerator().generate({ ...input, passages: [] });
    expect(without.every((q) => q.sources?.length === 0)).toBe(true);
  });

  it('keeps sources through validation', async () => {
    const generated = await new FakeQuestionGenerator().generate({ ...input, passages });
    const { accepted } = validateGenerated(generated);
    expect(accepted[0].sources).toEqual([1]);
  });
});
