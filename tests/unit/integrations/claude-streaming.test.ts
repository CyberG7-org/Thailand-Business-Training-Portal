import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeDbdExtractor } from '@/lib/integrations/extraction/claude';
import { ClaudeQuestionGenerator } from '@/lib/integrations/question-gen/claude';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import { SAMPLE_API_EXTRACTION } from './api-extraction-fixture';

/**
 * The SDK refuses non-streaming requests whose max_tokens implies more than ten minutes of
 * output ("Streaming is required for operations that may take longer than 10 minutes"), which
 * the extractor (24k) and the generator (32k) both exceed. Every long structured call must go
 * through `messages.stream(...).finalMessage()`, so the stubbed client offers nothing else.
 */
function streamOnlyClient(parsedOutput: unknown, calls: Record<string, unknown>[] = []) {
  return {
    messages: {
      stream: (params: Record<string, unknown>) => {
        calls.push(params);
        return {
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            content: [],
            parsed_output: parsedOutput,
          }),
        };
      },
      parse: () => {
        throw new Error('non-streaming parse must not be used for long structured calls');
      },
    },
  } as unknown as Anthropic;
}

describe('long structured calls stream', () => {
  it('extraction reads the parsed output from a streamed response', async () => {
    const calls: Record<string, unknown>[] = [];
    const extractor = new ClaudeDbdExtractor(streamOnlyClient(SAMPLE_API_EXTRACTION, calls));
    const out = await extractor.extract([new Uint8Array([1, 2, 3])]);
    expect(out.company_name_th.value).toBe('บริษัท ทดสอบ จำกัด');
    expect(out.company_name_en.value).toBeNull();
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5' });
    expect(calls[0].output_config).toBeDefined();
  });

  it('question generation reads the parsed questions from a streamed response', async () => {
    const questions = await new FakeQuestionGenerator().generate({
      reference: null,
      material: { text: '', pdf: null },
      count: 1,
      templateCount: 0,
      difficulty: 'easy',
      focus: null,
    });
    const calls: Record<string, unknown>[] = [];
    const generator = new ClaudeQuestionGenerator(streamOnlyClient({ questions }, calls));
    const out = await generator.generate({
      reference: null,
      material: { text: 'x', pdf: null },
      count: 1,
      templateCount: 0,
      difficulty: 'easy',
      focus: null,
    });
    expect(out).toEqual(questions);
    expect(calls[0].output_config).toBeDefined();
  });

  it('translation reads the parsed languages from a streamed response', async () => {
    const source = (
      await new FakeQuestionGenerator().generate({
        reference: null,
        material: { text: '', pdf: null },
        count: 1,
        templateCount: 0,
        difficulty: 'easy',
        focus: null,
      })
    )[0].localizations.th;
    const generator = new ClaudeQuestionGenerator(
      streamOnlyClient({ th: null, en: { ...source, prompt: 'EN' }, zh: null }),
    );
    const out = await generator.translate({
      sourceLanguage: 'th',
      source,
      targetLanguages: ['en'],
    });
    expect(out.en?.prompt).toBe('EN');
  });
});

describe('transcript-path calls stream too', () => {
  it('classify, extractFacts and sweep read parsed output from streamed responses', async () => {
    const calls: Record<string, unknown>[] = [];
    const classifier = new ClaudeDbdExtractor(
      streamOnlyClient({ document_type: 'shareholder_list' }, calls),
    );
    expect(await classifier.classify('บัญชีรายชื่อผู้ถือหุ้น')).toBe('shareholder_list');
    expect(await classifier.classify('   ')).toBe('other'); // no call for a blank page
    expect(calls).toHaveLength(1);

    const facts = new ClaudeDbdExtractor(streamOnlyClient(SAMPLE_API_EXTRACTION));
    const out = await facts.extractFacts([{ documentPosition: 1, page: 1, text: 'x' }]);
    expect(out.company_name_th.value).toBe('บริษัท ทดสอบ จำกัด');

    const sweeper = new ClaudeDbdExtractor(
      streamOnlyClient({
        objectives: [{ no: 1, text: 'ค้าปลีก' }],
        shareholders: [{ name: 'นาย ก', nationality: '', shares: 0, percent: 0 }],
        promoters: [],
        share_structure: { total_shares: 0, par_value: 0, paid_up_capital: 0, share_type: '' },
      }),
    );
    const swept = await sweeper.sweep([{ page: 1, text: 'x' }], 'shareholder_list');
    expect(swept.shareholders[0]).toEqual({
      name: 'นาย ก',
      nationality: null,
      shares: null,
      percent: null,
    });
  });

  it('reports a sweep cut off by the output limit as too_large instead of a provider error', async () => {
    const client = {
      messages: {
        stream: () => ({
          finalMessage: async () => ({
            stop_reason: 'max_tokens',
            content: [],
            parsed_output: null,
          }),
        }),
      },
    } as unknown as Anthropic;
    await expect(
      new ClaudeDbdExtractor(client).sweep([{ page: 1, text: 'x' }], 'shareholder_list'),
    ).rejects.toMatchObject({ code: 'too_large' });
  });
});
