import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CategoryMapInput, CategoryMapResult, CategoryMapper } from './types';

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 20_000;

const SYSTEM = `You classify what a Thai company actually does into exactly one category from a fixed list.
Rules:
- Answer only with a key from the list, or "none" when no category fits.
- confidence is your probability (0 to 1) that the key describes the company's main business.
- Judge only from the text given; never add facts that are not written.`;

/** Maps the manager's business text to one Owner-controlled category (spec §5.3, D73). */
export class ClaudeCategoryMapper implements CategoryMapper {
  readonly name = 'claude' as const;
  readonly model = MODEL;

  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const keys = input.categories.map((c) => c.key);
    if (keys.length === 0) return { key: null, confidence: 0 };
    const schema = z.object({
      // "none" first: a non-empty tuple, which z.enum requires.
      key: z.enum(['none', ...keys]),
      confidence: z.number().min(0).max(1),
    });
    const list = input.categories.map((c) => `${c.key}: ${c.label_th} / ${c.label_en}`).join('\n');
    const response = await this.client.messages
      .stream(
        {
          model: MODEL,
          max_tokens: 200,
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: `CATEGORIES:\n${list}\n\nNATURE OF BUSINESS:\n${input.natureOfBusiness}\n\nPRODUCTS OR SERVICES:\n${input.productsServices ?? '-'}`,
            },
          ],
          output_config: { format: zodOutputFormat(schema) },
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    const parsed = response.parsed_output as z.infer<typeof schema> | null;
    if (!parsed) throw new Error('The category mapper returned nothing');
    if (parsed.key === 'none' || !keys.includes(parsed.key)) {
      return { key: null, confidence: parsed.confidence };
    }
    return { key: parsed.key, confidence: parsed.confidence };
  }
}
