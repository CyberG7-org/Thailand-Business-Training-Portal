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
