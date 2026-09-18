import { describe, expect, it } from 'vitest';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import { resolveQuestionGenProvider } from '@/lib/integrations/question-gen/index';
import { generationOutputSchema } from '@/lib/integrations/question-gen/schema';
import type { GeneratedQuestion } from '@/lib/integrations/question-gen/types';
import { validateGenerated } from '@/lib/integrations/question-gen/validate';

function question(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  const loc = (p: string) => ({
    prompt: p,
    options: [
      { key: 'A' as const, text: 'a {registered_capital}' },
      { key: 'B' as const, text: 'b {registered_capital|x2}' },
      { key: 'C' as const, text: 'c' },
      { key: 'D' as const, text: 'd' },
    ],
    correct_key: 'A' as const,
    explanation: 'why',
  });
  return {
    kind: 'dbd_template',
    localizations: {
      th: loc('ถาม {company_name_th}'),
      en: loc('ask {company_name_th}'),
      zh: loc('问 {company_name_th}'),
    },
    ...overrides,
  };
}

describe('validateGenerated', () => {
  it('accepts well-formed questions and trims text', () => {
    const q = question();
    q.localizations.en.prompt = '  ask {company_name_th}  ';
    const result = validateGenerated([q]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted[0].localizations.en.prompt).toBe('ask {company_name_th}');
  });

  it('rejects unknown placeholders, mismatched keys, bad option shapes, and template questions without placeholders', () => {
    const unknown = question();
    unknown.localizations.th.prompt = 'ถาม {company_phone}';
    const mismatch = question();
    mismatch.localizations.zh.correct_key = 'B';
    const shape = question();
    shape.localizations.en.options = shape.localizations.en.options.slice(0, 3);
    const differ = question();
    differ.localizations.zh.prompt = '问';
    const noField = question({
      kind: 'dbd_template',
      localizations: {
        th: { prompt: 'x', options: opts(), correct_key: 'A', explanation: '' },
        en: { prompt: 'x', options: opts(), correct_key: 'A', explanation: '' },
        zh: { prompt: 'x', options: opts(), correct_key: 'A', explanation: '' },
      },
    });
    const result = validateGenerated([unknown, mismatch, shape, differ, noField, question()]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      'Unknown placeholder field: company_phone',
      'correct key differs between languages',
      'en: expected 4 options, got 3',
      'placeholders differ between languages',
      'template question uses no placeholder',
    ]);
  });
});

function opts() {
  return [
    { key: 'A' as const, text: 'a' },
    { key: 'B' as const, text: 'b' },
    { key: 'C' as const, text: 'c' },
    { key: 'D' as const, text: 'd' },
  ];
}

describe('FakeQuestionGenerator', () => {
  it('produces the requested mix in three languages that passes validation and the output schema', async () => {
    const gen = new FakeQuestionGenerator();
    const questions = await gen.generate({
      material: { text: 'DBD basics\nmore', pdf: null },
      count: 3,
      templateCount: 1,
      difficulty: 'medium',
      focus: null,
    });
    expect(questions.map((q) => q.kind)).toEqual(['dbd_template', 'generic', 'generic']);
    expect(generationOutputSchema.safeParse({ questions }).success).toBe(true);
    expect(validateGenerated(questions).rejected).toEqual([]);
    expect(questions[1].localizations.th.prompt).toContain('DBD basics');

    const translated = await gen.translate({
      sourceLanguage: 'th',
      source: questions[0].localizations.th,
      targetLanguages: ['en', 'zh'],
    });
    expect(Object.keys(translated).sort()).toEqual(['en', 'zh']);
    expect(translated.en?.options[1].text).toContain('{registered_capital|x2}');
  });
});

describe('resolveQuestionGenProvider', () => {
  it('follows the standard provider pattern', () => {
    expect(resolveQuestionGenProvider({ ANTHROPIC_API_KEY: 'k' })).toBe('claude');
    expect(resolveQuestionGenProvider({ NODE_ENV: 'development' })).toBe('fake');
    expect(resolveQuestionGenProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(
      resolveQuestionGenProvider({ QUESTION_GEN_PROVIDER: 'fake', ANTHROPIC_API_KEY: 'k' }),
    ).toBe('fake');
  });
});
