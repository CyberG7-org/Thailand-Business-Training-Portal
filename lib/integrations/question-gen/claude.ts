import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describeReference } from './dbd-reference';
import { passagesBlock } from './passages';
import {
  GENERATION_INSTRUCTIONS,
  TRANSLATION_INSTRUCTIONS,
  generationOutputSchema,
  translationOutputSchema,
} from './schema';
import {
  QuestionGenError,
  type GenerateInput,
  type GeneratedLocalization,
  type GeneratedQuestion,
  type QuestionGenerator,
  type TranslateInput,
} from './types';

const MODEL = 'claude-opus-5';
const MAX_MATERIAL_CHARS = 60_000;

function toGenError(error: unknown): QuestionGenError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new QuestionGenError('Anthropic API key is missing or invalid', 'not_configured');
  }
  if (error instanceof Anthropic.APIError) {
    return new QuestionGenError(
      `Anthropic API error ${error.status}: ${error.message}`,
      'provider',
    );
  }
  return new QuestionGenError(error instanceof Error ? error.message : String(error), 'provider');
}

/** Real generator: Claude with zod structured output; PDFs travel as document blocks. */
export class ClaudeQuestionGenerator implements QuestionGenerator {
  readonly name = 'claude';
  readonly model = MODEL;
  private readonly client: Anthropic;

  constructor(client: Anthropic = new Anthropic()) {
    this.client = client;
  }

  async generate(input: GenerateInput): Promise<GeneratedQuestion[]> {
    const passages = input.passages ?? [];
    const content: Anthropic.ContentBlockParam[] = [];
    // Passages stand in for the whole PDF (spec §8); big packs never travel as a document.
    if (input.reference?.pdf && passages.length === 0) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from(input.reference.pdf).toString('base64'),
        },
      });
    }
    if (input.material.pdf) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from(input.material.pdf).toString('base64'),
        },
      });
    }
    const text = input.material.text.trim().slice(0, MAX_MATERIAL_CHARS);
    const request =
      `Create ${input.count} ${input.difficulty} question(s); ${input.templateCount} of them must be kind "dbd_template" ` +
      `(using placeholders) and ${input.count - input.templateCount} kind "generic".` +
      (input.focus ? `\nFocus: ${input.focus}` : '') +
      (input.reference
        ? `\n\nREFERENCE CERTIFICATE (example only; its values must NOT appear literally — use placeholders):\n` +
          describeReference(input.reference.record) +
          (input.reference.pdf && passages.length === 0
            ? '\nThe first attached document is this reference certificate.'
            : '')
        : '') +
      (passages.length > 0
        ? `\n\nREFERENCE PASSAGES (verbatim text of the reference company's own DBD documents, retrieved per interview concept; use them to see what the documents literally say and which particulars to ask about; their values must NOT appear literally — use placeholders; cite the numbers you used in "sources"):\n` +
          passagesBlock(passages)
        : '') +
      (text ? `\n\nMATERIAL (ground generic questions strictly in this):\n${text}` : '') +
      (input.material.pdf ? '\n\nAlso use the attached study document as material.' : '');
    content.push({ type: 'text', text: request });

    let response;
    try {
      // Streamed: the SDK refuses non-streaming requests this long (max_tokens ≥ ~21k).
      response = await this.client.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          system: GENERATION_INSTRUCTIONS,
          messages: [{ role: 'user', content }],
          output_config: { format: zodOutputFormat(generationOutputSchema) },
        })
        .finalMessage();
    } catch (error) {
      throw toGenError(error);
    }
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new QuestionGenError('The model did not return questions', 'invalid_output');
    }
    return response.parsed_output.questions;
  }

  async translate(
    input: TranslateInput,
  ): Promise<Partial<Record<'th' | 'en' | 'zh', GeneratedLocalization>>> {
    const request =
      `Source language: ${input.sourceLanguage}. Translate into: ${input.targetLanguages.join(', ')}.\n\n` +
      `SOURCE QUESTION (JSON):\n${JSON.stringify(input.source, null, 2)}`;
    let response;
    try {
      response = await this.client.messages
        .stream({
          model: MODEL,
          max_tokens: 8000,
          system: TRANSLATION_INSTRUCTIONS,
          messages: [{ role: 'user', content: request }],
          output_config: { format: zodOutputFormat(translationOutputSchema) },
        })
        .finalMessage();
    } catch (error) {
      throw toGenError(error);
    }
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new QuestionGenError('The model did not return a translation', 'invalid_output');
    }
    const out: Partial<Record<'th' | 'en' | 'zh', GeneratedLocalization>> = {};
    for (const lang of input.targetLanguages) {
      const value = response.parsed_output[lang];
      if (value) out[lang] = value;
    }
    return out;
  }
}
