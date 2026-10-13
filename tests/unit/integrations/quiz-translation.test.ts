import { describe, expect, it, vi } from 'vitest';
import { GeminiQuizTranslator } from '@/lib/integrations/translation/gemini-quiz';
import type { PresentedQuestion } from '@/lib/domain/mcq/attempt';

const source: PresentedQuestion[] = [
  {
    prompt: 'What is the monthly revenue of ABC Co.?',
    options: [
      { key: 'A', text: '100,000 THB' },
      { key: 'B', text: '200,000 THB' },
      { key: 'C', text: '300,000 THB' },
      { key: 'D', text: '400,000 THB' },
    ],
    explanation: 'The approved estimate is 200,000 THB.',
  },
];

const reply = (questions: unknown[]) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] } }],
    }),
    { status: 200 },
  );

describe('Malay quiz translation', () => {
  it('translates learner text while preserving keys, positions and numeric facts', async () => {
    const request = vi.fn().mockResolvedValue(
      reply([
        {
          prompt: 'Berapakah hasil bulanan ABC Co.?',
          options: ['100,000 THB', '200,000 THB', '300,000 THB', '400,000 THB'],
          explanation: 'Anggaran yang diluluskan ialah 200,000 THB.',
        },
      ]),
    );
    const result = await new GeminiQuizTranslator('test-key', request).translate(source);
    expect(result[0].prompt).toContain('hasil bulanan');
    expect(result[0].options.map((option) => option.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(result[0].options[1].text).toBe('200,000 THB');
  });

  it('rejects changed figures', async () => {
    const request = vi.fn().mockResolvedValue(
      reply([
        {
          prompt: 'Berapakah hasil bulanan ABC Co.?',
          options: ['100,000 THB', '250,000 THB', '300,000 THB', '400,000 THB'],
          explanation: 'Anggaran yang diluluskan ialah 250,000 THB.',
        },
      ]),
    );
    await expect(new GeminiQuizTranslator('test-key', request).translate(source)).rejects.toThrow(
      'numeric fact',
    );
  });
});
