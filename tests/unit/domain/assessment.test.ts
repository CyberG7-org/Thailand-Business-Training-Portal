import { describe, expect, it } from 'vitest';
import {
  evaluateResult,
  isSelectable,
  renderQuestion,
  scoreAnswers,
  selectQuestions,
  shuffleOptions,
  type QuestionOption,
  type SelectableQuestion,
} from '@/lib/domain/assessment/engine';
import { createRng, shuffleWith } from '@/lib/domain/assessment/random';
import {
  MissingFieldError,
  placeholderFields,
  renderTemplate,
  TemplateSyntaxError,
  type TemplateRecord,
} from '@/lib/domain/assessment/template';

const record: TemplateRecord = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  company_name_en: 'TEST CO., LTD.',
  juristic_id: '0105569000123',
  certificate_no: 'E1',
  registered_capital: 2000000,
  head_office_address: '99/9',
  registered_on: '2026-04-10',
  issued_on: '2026-07-13',
  directors: [{ name_th: 'นาย ก', name_en: null }],
  objectives_count: 14,
  signing_authority: null,
};

describe('seeded random', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = shuffleWith([1, 2, 3, 4, 5, 6, 7, 8], createRng('s1'));
    expect(a).toEqual(shuffleWith([1, 2, 3, 4, 5, 6, 7, 8], createRng('s1')));
    expect(a).not.toEqual(shuffleWith([1, 2, 3, 4, 5, 6, 7, 8], createRng('s2')));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('renderTemplate', () => {
  it('substitutes values with locale formatting', () => {
    expect(renderTemplate('ทุน {registered_capital} บาท', record, 's', 'th')).toBe(
      'ทุน 2,000,000 บาท',
    );
    expect(renderTemplate('Issued {issued_on}', record, 's', 'en')).toBe('Issued 13 July 2026');
    expect(renderTemplate('{issued_on}', record, 's', 'th')).toBe('13 กรกฎาคม 2569');
    expect(renderTemplate('{directors}', record, 's', 'th')).toBe('นาย ก');
  });
  it('produces numeric and date variants that differ from the real value', () => {
    expect(renderTemplate('{registered_capital|x2}', record, 's', 'en')).toBe('4,000,000');
    expect(renderTemplate('{registered_capital|x0.5}', record, 's', 'en')).toBe('1,000,000');
    expect(renderTemplate('{issued_on|+1m}', record, 's', 'en')).toBe('13 August 2026');
    expect(renderTemplate('{issued_on|-1y}', record, 's', 'en')).toBe('13 July 2025');
    expect(renderTemplate('{registered_on|+10d}', record, 's', 'en')).toBe('20 April 2026');
  });
  it('clamps month arithmetic to the last day of the month', () => {
    expect(
      renderTemplate('{issued_on|+1m}', { ...record, issued_on: '2026-01-31' }, 's', 'en'),
    ).toBe('28 February 2026');
  });
  it('shuffles digits deterministically and never returns the original', () => {
    const a = renderTemplate('{juristic_id|shuffle}', record, 'seed-a', 'en');
    expect(a).toBe(renderTemplate('{juristic_id|shuffle}', record, 'seed-a', 'en'));
    expect(a).not.toBe(record.juristic_id);
    expect(a.split('').sort().join('')).toBe(record.juristic_id!.split('').sort().join(''));
  });
  it('throws MissingFieldError for empty fields and syntax errors for bad placeholders', () => {
    expect(() => renderTemplate('{signing_authority}', record, 's', 'en')).toThrow(
      MissingFieldError,
    );
    expect(() => renderTemplate('{nope}', record, 's', 'en')).toThrow(TemplateSyntaxError);
    expect(() => renderTemplate('{company_name_th|x2}', record, 's', 'en')).toThrow(
      TemplateSyntaxError,
    );
  });
  it('lists referenced fields once each', () => {
    expect(
      placeholderFields('{registered_capital} vs {registered_capital|x2} {issued_on}'),
    ).toEqual(['registered_capital', 'issued_on']);
  });
});

describe('selection', () => {
  const base: SelectableQuestion = {
    id: 'q',
    kind: 'generic',
    approval_status: 'approved',
    active: true,
    pools: ['quiz', 'exam'],
    dbd_field_dependencies: [],
  };
  it('filters by approval, active flag, pool and resolvable fields', () => {
    expect(isSelectable(base, 'quiz', record)).toBe(true);
    expect(isSelectable({ ...base, approval_status: 'draft' }, 'quiz', record)).toBe(false);
    expect(isSelectable({ ...base, active: false }, 'quiz', record)).toBe(false);
    expect(isSelectable({ ...base, pools: ['exam'] }, 'quiz', record)).toBe(false);
    const template = {
      ...base,
      kind: 'dbd_template' as const,
      dbd_field_dependencies: ['signing_authority' as const],
    };
    expect(isSelectable(template, 'quiz', record)).toBe(false);
    expect(
      isSelectable({ ...template, dbd_field_dependencies: ['juristic_id'] }, 'quiz', record),
    ).toBe(true);
    expect(
      isSelectable({ ...template, dbd_field_dependencies: ['juristic_id'] }, 'quiz', null),
    ).toBe(false);
  });
  it('picks a deterministic subset of the requested size', () => {
    const questions = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `q${i}` }));
    const a = selectQuestions({ pool: 'quiz', count: 3, seed: 's', questions, record });
    const b = selectQuestions({ pool: 'quiz', count: 3, seed: 's', questions, record });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
  });
});

describe('option shuffle and rendering', () => {
  const options: QuestionOption[] = [
    { key: 'A', text: 'a' },
    { key: 'B', text: 'b' },
    { key: 'C', text: 'c' },
    { key: 'D', text: 'd' },
  ];
  it('permutes options deterministically per question', () => {
    const s1 = shuffleOptions(options, 'seed', 'q1');
    expect(shuffleOptions(options, 'seed', 'q1')).toEqual(s1);
    expect(s1.map((o) => o.key).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
  it('renders a personalized question with the correct key preserved', () => {
    const r = renderQuestion(
      'q9',
      {
        prompt: 'What is the registered capital of {company_name_th}?',
        options: [
          { key: 'A', text: '{registered_capital}' },
          { key: 'B', text: '{registered_capital|x2}' },
          { key: 'C', text: '{registered_capital|x0.5}' },
          { key: 'D', text: '{registered_capital|x10}' },
        ],
        correct_key: 'A',
        explanation: 'From the certificate.',
      },
      record,
      'seed',
      'en',
    );
    expect(r.prompt).toBe('What is the registered capital of บริษัท ทดสอบ จำกัด?');
    expect(r.options.find((o) => o.key === 'A')?.text).toBe('2,000,000');
    expect(r.options.map((o) => o.text)).toEqual(
      expect.arrayContaining(['4,000,000', '1,000,000', '20,000,000']),
    );
    expect(r.presentedOrder).toEqual(r.options.map((o) => o.key));
    expect(r.correctKey).toBe('A');
  });
});

describe('scoring', () => {
  it('counts correct answers and applies the passing mark', () => {
    expect(
      scoreAnswers([{ is_correct: true }, { is_correct: false }, { is_correct: null }]),
    ).toEqual({
      score: 1,
      maxScore: 3,
    });
    expect(evaluateResult(7, 10, 70)).toBe('pass');
    expect(evaluateResult(6, 10, 70)).toBe('fail');
    expect(evaluateResult(0, 0, 70)).toBe('fail');
  });
});
